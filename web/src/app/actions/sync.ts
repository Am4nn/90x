"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { checkins } from "@/db/schema";
import { latestSynced } from "@/lib/activity/queries";
import { syncEnabled, syncUser, type SyncResult } from "@/lib/activity/service";
import { requireViewer } from "@/lib/auth/viewer";
import { parseSyncedDetails } from "@/lib/library/checkin";
import { amendSyncedCheckin } from "@/lib/tracker/service";
import { key } from "@/lib/upstash/keys";
import { redis } from "@/lib/upstash/redis";

const OPEN_THROTTLE_SECONDS = 15 * 60;

/** The Sync button. */
export async function syncNow(): Promise<SyncResult> {
  const viewer = await requireViewer();
  const result = await syncUser(viewer.id);
  revalidatePath("/me");
  return result;
}

/** Honest wording for every way a sync can fail, so a fixable problem reads as one. */
function syncMessage(status: SyncResult["status"]): string {
  if (status === "disabled") return syncEnabled() ? "No LeetCode username set. Add it in setup." : "LeetCode sync is off.";
  if (status === "skipped") return "Sync is paused after repeated failures; it tries again tomorrow.";
  if (status === "unknown_user") return "LeetCode has no user with your username. Check it in setup.";
  return "LeetCode didn't respond. Your manual check-in still works.";
}

/** A problem's check-in as sync logged it; `at` is when LeetCode accepted (or last rejected) it. */
export type SyncedCheckin = {
  checkinId: string;
  result: "solved" | "hints" | "failed";
  attempts: number;
  /** The time already on the row, else the one sync measured; null when neither exists. */
  minutes: number | null;
  at: string;
};

/**
 * Sync, then report this problem's newest synced check-in. Reuses `syncUser` (the
 * same path as `syncNow`). The check-in is reported even when an earlier sync
 * wrote it (the app-open sync or the daily job often gets there first), so a
 * solve already in the log reads as logged, never as "no recent submission".
 * Hints are never inferred because LeetCode has no hint signal, and a time is
 * returned only when sync measured one or the reader set one.
 */
export async function syncForProblem(slug: string): Promise<{ found: SyncedCheckin | null } | { error: string }> {
  const viewer = await requireViewer();
  const parsed = z.string().min(1).max(200).safeParse(slug);
  if (!parsed.success) return { error: "That problem couldn't be synced." };
  const clean = parsed.data;
  try {
    const result = await syncUser(viewer.id);
    revalidatePath(`/library/problem/${clean}`);
    revalidatePath("/me");
    // A sync can tick today's missions through onCheckins, so Today must refresh too.
    revalidatePath("/today");
    if (result.status !== "ok") return { error: syncMessage(result.status) };
    const row = await latestSynced(viewer.id, clean);
    if (!row) return { found: null };
    return {
      found: {
        checkinId: row.checkinId,
        result: row.result as SyncedCheckin["result"],
        attempts: row.attempts ?? 1,
        minutes: row.minutes ?? row.minutesSuggested,
        at: row.at,
      },
    };
  } catch (e) {
    console.error("syncForProblem failed", e);
    return { error: "Couldn't reach LeetCode. Your manual check-in still works." };
  }
}

export type SyncedDetailsState = { ok?: boolean; error?: string };

/** Time, hints and a note on a check-in sync already wrote: updates that row, never adds one. */
export async function saveSyncedDetails(_: SyncedDetailsState, form: FormData): Promise<SyncedDetailsState> {
  const viewer = await requireViewer();
  const parsed = parseSyncedDetails(form);
  if (!parsed.success) return { error: "Couldn't read those details. Try again." };
  try {
    const saved = await amendSyncedCheckin(viewer.id, parsed.data);
    if (!saved) return { error: "That check-in isn't yours to change." };
  } catch (e) {
    console.error("saveSyncedDetails failed", e);
    return { error: "Couldn't save the details. Try again." };
  }
  const slug = String(form.get("problemSlug") ?? "");
  if (slug) revalidatePath(`/library/problem/${slug}`);
  revalidatePath("/today");
  revalidatePath("/me");
  return { ok: true };
}

/** One-tap time for a synced solve: over the server connection, and only on the viewer's own check-in. */
export async function setMinutes(form: FormData) {
  const viewer = await requireViewer();
  const id = z.uuid().safeParse(form.get("checkinId"));
  const minutes = Number(form.get("minutes"));
  if (!id.success || !Number.isInteger(minutes) || minutes < 1 || minutes > 600) return;
  try {
    await db
      .update(checkins)
      .set({ minutes })
      .where(and(eq(checkins.id, id.data), eq(checkins.userId, viewer.id)));
  } catch (e) {
    // As before: a time that fails to save is dropped quietly; the solve itself is already logged.
    console.error("setMinutes failed", e);
    return;
  }
  revalidatePath("/me");
}

/** Runs when the app opens, at most once per 15 minutes per user. */
export async function syncOnOpen(): Promise<SyncResult> {
  const viewer = await requireViewer();
  const fresh = await redis().set(key("lcsync", viewer.id), Date.now(), { nx: true, ex: OPEN_THROTTLE_SECONDS });
  if (fresh === null) return { status: "skipped" };
  return syncUser(viewer.id);
}
