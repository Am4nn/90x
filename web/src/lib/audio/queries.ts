import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { lessonAudio, lessonAudioProgress } from "@/db/schema";

export type AudioLine = {
  role: "narrator" | "state";
  text: string;
  section: "intro" | "walkthrough" | "pitfalls" | "recap" | null;
  start_s: number;
  end_s: number;
};

export async function audioFor(topicSlug: string): Promise<{ r2Key: string; durationS: number; lines: AudioLine[] } | null> {
  const [row] = await db
    .select({ r2Key: lessonAudio.r2Key, durationS: lessonAudio.durationS, lines: lessonAudio.lines })
    .from(lessonAudio)
    .where(eq(lessonAudio.topicSlug, topicSlug));
  if (!row) return null;
  return { r2Key: row.r2Key, durationS: row.durationS, lines: Array.isArray(row.lines) ? (row.lines as AudioLine[]) : [] };
}

export async function progressFor(
  userId: string,
  topicSlug: string,
): Promise<{ positionS: number; rate: number; finishedAt: string | null } | null> {
  const [row] = await db
    .select({ positionS: lessonAudioProgress.positionS, rate: lessonAudioProgress.rate, finishedAt: lessonAudioProgress.finishedAt })
    .from(lessonAudioProgress)
    .where(and(eq(lessonAudioProgress.userId, userId), eq(lessonAudioProgress.topicSlug, topicSlug)));
  return row ?? null;
}

/** The speed this person chose most recently, on any lesson; 1 when they never changed it. */
export async function lastRate(userId: string): Promise<number> {
  const [row] = await db
    .select({ rate: lessonAudioProgress.rate })
    .from(lessonAudioProgress)
    .where(eq(lessonAudioProgress.userId, userId))
    .orderBy(desc(lessonAudioProgress.updatedAt))
    .limit(1);
  return row?.rate ?? 1;
}
