"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { checkins } from "@/db/schema";
import { latestSynced, leetcodeUsername } from "@/lib/activity/queries";
import { checkUsername, dropUsername, replaceUsername, saveUsername, syncEnabled, syncUser, type SyncResult } from "@/lib/activity/service";
import { parseLeetcodeUsername } from "@/lib/activity/username";
import { requireViewer } from "@/lib/auth/viewer";
import { parseSyncedDetails } from "@/lib/library/checkin";
import { logError } from "@/lib/log";
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
  if (status === "disabled") return syncEnabled() ? "No LeetCode username set. Add it in Settings." : "LeetCode sync is off.";
  if (status === "skipped") return "Sync is paused after repeated failures; it tries again tomorrow.";
  if (status === "unknown_user") return "LeetCode has no user with your username. Check it in Settings.";
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

/** This problem's newest synced check-in, as the check-in panel shows it; null when sync never logged it. */
async function syncedCheckin(userId: string, slug: string): Promise<SyncedCheckin | null> {
  const row = await latestSynced(userId, slug);
  if (!row) return null;
  return {
    checkinId: row.checkinId,
    result: row.result as SyncedCheckin["result"],
    attempts: row.attempts ?? 1,
    minutes: row.minutes ?? row.minutesSuggested,
    at: row.at,
  };
}

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
    return { found: await syncedCheckin(viewer.id, clean) };
  } catch (e) {
    logError("syncForProblem failed", e);
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
    logError("saveSyncedDetails failed", e);
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
    logError("setMinutes failed", e);
    return;
  }
  revalidatePath("/me");
}

/** `found` is the problem's synced check-in when Connect was given a slug and the sync went through. */
export type ConnectResult = { ok: true; result: SyncResult; found?: SyncedCheckin | null } | { error: string };

/**
 * For someone who skipped LeetCode at Set up: the connect row that stands in for
 * every Sync button while there is no username. Saves it and syncs at once, so the
 * reader sees it worked. A name LeetCode doesn't know is taken back, so the next
 * try starts clean. A username already set is never replaced here. From a problem
 * page it also reports that problem, from the same sync, so the panel needn't sync again.
 */
export async function connectLeetCode(raw: string, slug?: string): Promise<ConnectResult> {
  const viewer = await requireViewer();
  if (!syncEnabled()) return { error: syncMessage("disabled") };
  const username = parseLeetcodeUsername(raw);
  if (!username) return { error: "Enter your LeetCode username, like am4nn." };
  try {
    if (!(await saveUsername(viewer.id, username))) return { error: "You already have a LeetCode username." };
    const result = await syncUser(viewer.id);
    if (result.status === "unknown_user") {
      await dropUsername(viewer.id, username);
      return { error: `LeetCode has no user named ${username}.` };
    }
    revalidatePath("/me");
    revalidatePath("/today");
    const problem = slug ? z.string().min(1).max(200).safeParse(slug) : null;
    if (!problem?.success || result.status !== "ok") return { ok: true, result };
    revalidatePath(`/library/problem/${problem.data}`);
    return { ok: true, result, found: await syncedCheckin(viewer.id, problem.data) };
  } catch (e) {
    logError("connectLeetCode failed", e);
    return { error: "Couldn't save that. Try again." };
  }
}

export type ChangeResult = { ok: true; username: string | null; result?: SyncResult } | { error: string };

const SETTINGS_PATHS = ["/me", "/me/settings", "/today"];

/**
 * Settings → LeetCode → Save. The new name is checked with LeetCode before anything
 * changes, so a typo (or LeetCode being down) leaves the current name as it was. On
 * success the old name's sync status is forgotten and the new one syncs at once.
 */
export async function changeLeetCode(raw: string): Promise<ChangeResult> {
  const viewer = await requireViewer();
  if (!syncEnabled()) return { error: syncMessage("disabled") };
  const username = parseLeetcodeUsername(raw);
  if (!username) return { error: "Enter your LeetCode username, like am4nn." };
  try {
    if ((await leetcodeUsername(viewer.id)) === username) return { ok: true, username };
    const check = await checkUsername(username);
    if (check === "unknown") return { error: `LeetCode has no user named ${username}.` };
    if (check === "unreachable") return { error: "Couldn't reach LeetCode to check that name. Try again in a minute." };
    await replaceUsername(viewer.id, username);
    // Saved from here on: the pages show the new name even if the first sync fails.
    for (const path of SETTINGS_PATHS) revalidatePath(path);
    const result = await syncUser(viewer.id).catch((e: unknown) => {
      logError("changeLeetCode: first sync failed", e);
      return undefined;
    });
    return { ok: true, username, result };
  } catch (e) {
    logError("changeLeetCode failed", e);
    return { error: "Couldn't save that. Try again." };
  }
}

/** Settings → LeetCode → Remove. Sync stops; check-ins it already made stay. */
export async function removeLeetCode(): Promise<ChangeResult> {
  const viewer = await requireViewer();
  try {
    await replaceUsername(viewer.id, null);
  } catch (e) {
    logError("removeLeetCode failed", e);
    return { error: "Couldn't remove it. Try again." };
  }
  for (const path of SETTINGS_PATHS) revalidatePath(path);
  return { ok: true, username: null };
}

/** Runs when the app opens, at most once per 15 minutes per user. */
export async function syncOnOpen(): Promise<SyncResult> {
  const viewer = await requireViewer();
  const fresh = await redis().set(key("lcsync", viewer.id), Date.now(), { nx: true, ex: OPEN_THROTTLE_SECONDS });
  if (fresh === null) return { status: "skipped" };
  return syncUser(viewer.id);
}
