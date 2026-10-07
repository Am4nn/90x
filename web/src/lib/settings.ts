import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { publishMaintenance } from "@/lib/maintenance/flag";
import type { MaintenanceState } from "@/lib/maintenance/rules";
import { key } from "@/lib/upstash/keys";
import { redis } from "@/lib/upstash/redis";
import { DEFAULT_SETTINGS, type GeneralSettings, mergeSettings, settingRows, type Settings } from "./settings-rules";

// Admin-controlled switches and caps (see settings-rules.ts). Read on hot paths such
// as every AI call, so the merged result is cached in Redis for a short time; a save
// clears the cache so the admin sees their change at once.

const CACHE_KEY = key("settings");
const CACHE_SECONDS = 30;

/** `fresh` skips the short Redis cache: for the admin page, which must show what is stored. */
export async function getSettings({ fresh = false }: { fresh?: boolean } = {}): Promise<Settings> {
  try {
    const cached = fresh ? null : await redis().get<Settings>(CACHE_KEY);
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

/** Upserts the given settings' rows and clears the cache. The caller has already checked the viewer is an admin. */
async function writeSettings(settings: Partial<Settings>, adminId: string): Promise<void> {
  const rows = settingRows(settings).map((r) => ({ key: r.key, value: r.value, updatedBy: adminId }));
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

/** Save the general settings. The maintenance switch and message are not among them, so this never touches them. */
export async function saveSettings(next: GeneralSettings, adminId: string): Promise<void> {
  await writeSettings(next, adminId);
}

/** Save the maintenance switch and message, then mirror them to Redis, which is what the proxy reads.
 *  `mirrored: false` means the database has the change but the app has not switched. */
export async function saveMaintenance(state: MaintenanceState, adminId: string): Promise<{ mirrored: boolean }> {
  await writeSettings({ maintenance: state.on, maintenanceMessage: state.message }, adminId);
  return mirror(state);
}

/** Sends the stored switch and message to Redis again, for when the two disagree. */
export async function reapplyMaintenance(): Promise<{ mirrored: boolean }> {
  const settings = await getSettings({ fresh: true });
  return mirror({ on: settings.maintenance, message: settings.maintenanceMessage });
}

async function mirror(state: MaintenanceState): Promise<{ mirrored: boolean }> {
  try {
    await publishMaintenance(state);
    return { mirrored: true };
  } catch (e) {
    console.error("maintenance switch not mirrored to Redis", e);
    return { mirrored: false };
  }
}
