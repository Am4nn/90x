import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { key } from "@/lib/upstash/keys";
import { redis } from "@/lib/upstash/redis";
import { DEFAULT_SETTINGS, mergeSettings, settingRows, type Settings } from "./settings-rules";

// Admin-controlled switches and caps (see settings-rules.ts). Read on hot paths such
// as every AI call, so the merged result is cached in Redis for a short time; a save
// clears the cache so the admin sees their change at once.

const CACHE_KEY = key("settings");
const CACHE_SECONDS = 30;

export async function getSettings(): Promise<Settings> {
  try {
    const cached = await redis().get<Settings>(CACHE_KEY);
    if (cached && typeof cached === "object") return mergeSettings(settingRows(cached));
  } catch (e) {
    console.error("settings cache unreadable", e);
  }
  let settings: Settings;
  try {
    settings = mergeSettings(await db.select({ key: appSettings.key, value: appSettings.value }).from(appSettings));
  } catch (e) {
    // The defaults are the safe side: nobody is auto-approved and the AI caps still apply.
    console.error("settings unreadable, using defaults", e);
    return DEFAULT_SETTINGS;
  }
  try {
    await redis().set(CACHE_KEY, JSON.stringify(settings), { ex: CACHE_SECONDS });
  } catch (e) {
    console.error("settings cache not written", e);
  }
  return settings;
}

/** Save every setting at once. The caller has already checked the viewer is an admin. */
export async function saveSettings(next: Settings, adminId: string): Promise<void> {
  const rows = settingRows(next).map((r) => ({ key: r.key, value: r.value, updatedBy: adminId }));
  await db
    .insert(appSettings)
    .values(rows)
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: sql`excluded.value`, updatedBy: sql`excluded.updated_by`, updatedAt: sql`now()` },
    });
  try {
    await redis().del(CACHE_KEY);
  } catch (e) {
    console.error("settings cache not cleared", e);
  }
}
