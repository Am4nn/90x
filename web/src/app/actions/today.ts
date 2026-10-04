"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { requireViewer } from "@/lib/auth/viewer";
import { markOpened, markStudied, skipReview, startRevive, unmarkStudied } from "@/lib/tracker/service";

async function guarded(fn: () => Promise<FormState | void>): Promise<FormState> {
  try {
    const result = await fn();
    if (result && result.error) return result;
    revalidatePath("/today");
    return { ok: true };
  } catch (e) {
    console.error("today action failed", e);
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
    if (studied) await markStudied(viewer.id, topicSlug);
    else await unmarkStudied(viewer.id, topicSlug);
    revalidatePath(`/library/topic/${topicSlug}`);
    revalidatePath("/library");
  });
}

export async function markOpenedAction(topicSlug: string): Promise<FormState> {
  const viewer = await requireViewer();
  if (!/^[a-z0-9-]{1,120}$/.test(topicSlug)) return { error: "Unknown topic." };
  return guarded(async () => {
    await markOpened(viewer.id, topicSlug);
    revalidatePath("/library");
  });
}
