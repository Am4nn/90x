"use server";

import { revalidatePath } from "next/cache";
import { syncUser, type SyncResult } from "@/lib/activity/service";
import { requireViewer } from "@/lib/auth/viewer";
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

/** Runs when the app opens, at most once per 15 minutes per user. */
export async function syncOnOpen(): Promise<SyncResult> {
  const viewer = await requireViewer();
  const fresh = await redis().set(key("lcsync", viewer.id), Date.now(), { nx: true, ex: OPEN_THROTTLE_SECONDS });
  if (fresh === null) return { status: "skipped" };
  return syncUser(viewer.id);
}
