"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { syncEnabled, syncUser, type SyncResult } from "@/lib/activity/service";
import type { SyncedAttempt } from "@/lib/activity/sync";
import { requireViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
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

/**
 * Sync, then report only what this run found for one problem. Reuses `syncUser`
 * (the same path as `syncNow`); hints are never inferred because LeetCode has no
 * hint signal, and a time is returned only when sync measured one.
 */
export async function syncForProblem(slug: string): Promise<{ found: SyncedAttempt | null } | { error: string }> {
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
    return { found: result.created.find((attempt) => attempt.slug === clean) ?? null };
  } catch (e) {
    console.error("syncForProblem failed", e);
    return { error: "Couldn't reach LeetCode. Your manual check-in still works." };
  }
}

/** One-tap time for a synced solve (written under RLS: own check-ins only). */
export async function setMinutes(form: FormData) {
  await requireViewer();
  const id = String(form.get("checkinId") ?? "");
  const minutes = Number(form.get("minutes"));
  if (!id || !Number.isInteger(minutes) || minutes < 1 || minutes > 600) return;
  const supabase = await createClient();
  await supabase.from("checkins").update({ minutes }).eq("id", id);
  revalidatePath("/me");
}

/** Runs when the app opens, at most once per 15 minutes per user. */
export async function syncOnOpen(): Promise<SyncResult> {
  const viewer = await requireViewer();
  const fresh = await redis().set(key("lcsync", viewer.id), Date.now(), { nx: true, ex: OPEN_THROTTLE_SECONDS });
  if (fresh === null) return { status: "skipped" };
  return syncUser(viewer.id);
}
