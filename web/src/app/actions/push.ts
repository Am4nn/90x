"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { db } from "@/db";
import { profiles, pushSubscriptions } from "@/db/schema";
import { requireViewer } from "@/lib/auth/viewer";
import { pushEnabled, saveSubscription, sendToUser } from "@/lib/push";
import { describeResult } from "@/lib/push-rules";
import { takeSlot } from "@/lib/upstash/rate-limit";

export async function savePushSubscription(raw: unknown): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    if (!(await saveSubscription(viewer.id, raw))) return { error: "This browser gave an unusable subscription." };
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

/** Sends a test push to the caller's own devices and says what each push service answered. */
export async function sendTestPush(): Promise<FormState> {
  const viewer = await requireViewer();
  if (!pushEnabled()) return { error: "Push isn't set up on the server (VAPID keys are missing)." };
  const slot = await takeSlot(viewer.id, "pushTest");
  if (!slot.allowed) return { error: "That's enough test notifications for now. Try again later." };
  const { results } = await sendToUser(
    viewer.id,
    { title: "90x test", body: "If you can read this, notifications work on this device.", url: "/me/settings", tag: "test" },
    { ttl: 120, urgency: "high" },
  );
  if (!results.length) return { error: "No device is subscribed. Turn on Push notifications first." };
  const note = results.map(describeResult).join(" ");
  return results.some((r) => r.kind === "ok") ? { ok: true, note } : { error: note };
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
