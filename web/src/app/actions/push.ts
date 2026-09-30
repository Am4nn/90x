"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { db } from "@/db";
import { profiles, pushSubscriptions } from "@/db/schema";
import { requireViewer } from "@/lib/auth/viewer";

const Subscription = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function savePushSubscription(raw: unknown): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = Subscription.safeParse(raw);
  if (!parsed.success) return { error: "This browser gave an unusable subscription." };
  const { endpoint, keys } = parsed.data;
  try {
    // An endpoint belongs to one browser; if someone else signed in on it before, it moves to you.
    await db
      .insert(pushSubscriptions)
      .values({ userId: viewer.id, endpoint, p256Dh: keys.p256dh, auth: keys.auth })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: viewer.id, p256Dh: keys.p256dh, auth: keys.auth } });
    revalidatePath("/me/settings");
    return { ok: true };
  } catch (e) {
    console.error("savePushSubscription failed", e);
    return { error: "Couldn't turn on notifications. Try again." };
  }
}

export async function removePushSubscription(endpoint: string): Promise<FormState> {
  const viewer = await requireViewer();
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, viewer.id), eq(pushSubscriptions.endpoint, endpoint)));
  revalidatePath("/me/settings");
  return { ok: true };
}

const Settings = z.object({
  evening: z.boolean(),
  friends: z.boolean(),
  weekly: z.boolean(),
  morningHour: z.number().int().min(0).max(23).nullable(),
});

export async function savePushSettings(raw: unknown): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = Settings.safeParse(raw);
  if (!parsed.success) return { error: "Unknown setting." };
  const { evening, friends, weekly, morningHour } = parsed.data;
  try {
    await db
      .update(profiles)
      .set({ notifications: { evening, friends, weekly }, morningPushHour: morningHour })
      .where(eq(profiles.userId, viewer.id));
    revalidatePath("/me/settings");
    return { ok: true };
  } catch (e) {
    console.error("savePushSettings failed", e);
    return { error: "Couldn't save that. Try again." };
  }
}
