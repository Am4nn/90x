"use server";

import { revalidatePath } from "next/cache";
import { syncUser, type SyncResult } from "@/lib/activity/service";
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
