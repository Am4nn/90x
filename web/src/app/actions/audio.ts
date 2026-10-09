"use server";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { lessonAudioProgress } from "@/db/schema";
import { audioEnv } from "@/lib/audio/env";
import { type AudioLine, audioFor } from "@/lib/audio/queries";
import { SIGNED_URL_TTL_S, signAudioUrl } from "@/lib/audio/sign";
import { requireViewer } from "@/lib/auth/viewer";
import { logError } from "@/lib/log";
import { takeSlot } from "@/lib/upstash/rate-limit";

export type AudioUrlResult = { url: string; r2Key: string; expiresAt: number } | { error: "no-audio" | "limit" | "unavailable" };

/** A fresh 12-hour URL for one lesson's audio. Viewer first, then the row (no slot is spent on a lesson
 *  without audio), then one of the person's 60 hourly signatures, then a local signature. */
export async function audioUrl(topicSlug: string): Promise<AudioUrlResult> {
  const viewer = await requireViewer();
  const env = audioEnv();
  if (!env) return { error: "unavailable" };
  const audio = await audioFor(topicSlug);
  if (!audio) return { error: "no-audio" };
  const slot = await takeSlot(viewer.id, "audioUrl");
  if (!slot.allowed) return { error: "limit" };
  try {
    const url = await signAudioUrl(audio.r2Key, env);
    return { url, r2Key: audio.r2Key, expiresAt: Date.now() + SIGNED_URL_TTL_S * 1000 };
  } catch (e) {
    logError("audio url signing failed", e, { topicSlug });
    return { error: "unavailable" };
  }
}

/** A lesson's transcript, for a download saved before downloads carried one (Settings, Downloaded lessons).
 *  No URL is signed, so no slot is spent; null when the lesson has no audio. */
export async function audioLines(topicSlug: string): Promise<AudioLine[] | null> {
  await requireViewer();
  const audio = await audioFor(topicSlug);
  return audio ? audio.lines : null;
}

const SPEEDS = new Set([0.8, 1, 1.25, 1.5, 1.75, 2]);

/** Where the viewer is in a lesson. `finished` sets finished_at once; it is never cleared. Fails quietly: progress is a convenience. */
export async function saveAudioProgress(input: { topicSlug: string; positionS: number; rate: number; finished: boolean }): Promise<void> {
  const viewer = await requireViewer();
  const positionS = Number.isFinite(input.positionS) ? Math.max(0, input.positionS) : 0;
  const rate = SPEEDS.has(input.rate) ? input.rate : 1;
  try {
    await db
      .insert(lessonAudioProgress)
      .values({ userId: viewer.id, topicSlug: input.topicSlug, positionS, rate, finishedAt: input.finished ? sql`now()` : null })
      .onConflictDoUpdate({
        target: [lessonAudioProgress.userId, lessonAudioProgress.topicSlug],
        set: {
          positionS,
          rate,
          updatedAt: sql`now()`,
          finishedAt: input.finished ? sql`coalesce(${lessonAudioProgress.finishedAt}, now())` : sql`${lessonAudioProgress.finishedAt}`,
        },
      });
  } catch (e) {
    logError("audio progress not saved", e, { topicSlug: input.topicSlug });
  }
}
