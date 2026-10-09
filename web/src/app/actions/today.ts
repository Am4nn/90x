"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { requireViewer } from "@/lib/auth/viewer";
import { logError } from "@/lib/log";
import { addExtra, markOpened, markStudied, removeExtra, skipReview, startRevive, unmarkStudied } from "@/lib/tracker/service";

async function guarded(fn: () => Promise<FormState | void>): Promise<FormState> {
  try {
    const result = await fn();
    if (result && result.error) return result;
    revalidatePath("/today");
    return { ok: true, ...(result?.xp || result?.bonus ? { xp: result.xp ?? 0, bonus: result.bonus ?? 0 } : {}) };
  } catch (e) {
    logError("today action failed", e);
    return { error: "That didn't save. Try again." };
  }
}

export async function skipReviewAction(missionId: string, mode: "not_today" | "got_it"): Promise<FormState> {
  const viewer = await requireViewer();
  if (!z.uuid().safeParse(missionId).success || !["not_today", "got_it"].includes(mode)) return { error: "Unknown mission." };
  return guarded(() => skipReview(viewer.id, missionId, mode));
}

export async function reviveAction(date: string): Promise<FormState> {
  const viewer = await requireViewer();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Unknown day." };
  return guarded(() => startRevive(viewer.id, date));
}

export async function markStudiedAction(topicSlug: string, studied: boolean): Promise<FormState> {
  const viewer = await requireViewer();
  if (!/^[a-z0-9-]{1,120}$/.test(topicSlug)) return { error: "Unknown topic." };
  return guarded(async () => {
    let gain: FormState = {};
    if (studied) gain = await markStudied(viewer.id, topicSlug);
    else await unmarkStudied(viewer.id, topicSlug);
    revalidatePath(`/library/topic/${topicSlug}`);
    revalidatePath("/library");
    return gain;
  });
}

/** A minute on a lesson. Only a first open changes what the reader sees (the Library's "opened" mark), so only
 *  then are Today and the Library revalidated; a re-open just bumps an admin counter and re-renders nothing. */
export async function markOpenedAction(topicSlug: string): Promise<FormState> {
  const viewer = await requireViewer();
  if (!/^[a-z0-9-]{1,120}$/.test(topicSlug)) return { error: "Unknown topic." };
  try {
    if (await markOpened(viewer.id, topicSlug)) {
      revalidatePath("/today");
      revalidatePath("/library");
    }
    return { ok: true };
  } catch (e) {
    logError("today action failed", e);
    return { error: "That didn't save. Try again." };
  }
}

/** "+ Add a problem": one more new problem, by the planner's rules, as an extra. Works on any day, done or not. */
export async function addExtraAction(): Promise<FormState> {
  const viewer = await requireViewer();
  return guarded(() => addExtra(viewer.id));
}

/** The × on an extra: removes that one open extra of the viewer's. Nothing else can be removed this way. */
export async function removeExtraAction(missionId: string): Promise<FormState> {
  const viewer = await requireViewer();
  if (!z.uuid().safeParse(missionId).success) return { error: "Unknown mission." };
  return guarded(() => removeExtra(viewer.id, missionId));
}
