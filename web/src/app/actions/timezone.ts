"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireViewer } from "@/lib/auth/viewer";
import { logError } from "@/lib/log";
import { isTimeZone } from "@/lib/zones";

export type TimezoneResult = { ok: true; timezone: string } | { error: string };

/**
 * Settings → Timezone. Changed by hand only: 90x never moves it when the device
 * travels. It applies from the next page load: today's date, the day's missions
 * and the notification hours all follow it from then on.
 */
export async function saveTimezone(zone: string): Promise<TimezoneResult> {
  const viewer = await requireViewer();
  if (typeof zone !== "string" || !isTimeZone(zone)) return { error: "Pick a time zone from the list." };
  if (zone === viewer.timezone) return { ok: true, timezone: zone };
  try {
    await db.update(profiles).set({ timezone: zone }).where(eq(profiles.userId, viewer.id));
  } catch (e) {
    // Postgres checks the name against its own tz list (profiles_timezone_valid), which can lag the browser's.
    logError("saveTimezone failed", e);
    return { error: "That time zone couldn't be saved. Pick a nearby city in the same zone." };
  }
  for (const path of ["/today", "/me", "/me/settings"]) revalidatePath(path);
  return { ok: true, timezone: zone };
}
