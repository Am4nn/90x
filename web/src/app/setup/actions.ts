"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireViewer } from "@/lib/auth/viewer";
import { logError } from "@/lib/log";
import { parseSetup } from "@/lib/setup";
import { startCampaign } from "@/lib/tracker/campaign";

export type SetupState = { errors?: Record<string, string>; message?: string };

export async function saveSetup(_: SetupState, form: FormData): Promise<SetupState> {
  const viewer = await requireViewer({ allowSetup: true });
  const parsed = parseSetup(form);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors };
  }
  // Over the server connection, scoped to the verified viewer (the row policy's own-row check); the Data API
  // cannot write these columns. zod has already validated and stripped the form.
  const s = parsed.data;
  try {
    await db
      .update(profiles)
      .set({
        name: s.name,
        role: s.role,
        language: s.language,
        level: s.level,
        timezone: s.timezone,
        campaignDays: s.campaign_days,
        leetcodeUsername: s.leetcode_username,
        hasLeetcodePremium: s.has_leetcode_premium,
        weekdayMinutes: s.weekday_minutes,
        weekendMinutes: s.weekend_minutes,
        setupDoneAt: new Date().toISOString(),
      })
      .where(eq(profiles.userId, viewer.id));
  } catch (e) {
    logError("saveSetup failed", e);
    return { message: "Couldn't save your setup. Try again." };
  }
  try {
    await startCampaign(viewer.id, parsed.data.campaign_days, parsed.data.weekday_minutes, parsed.data.weekend_minutes, parsed.data.level);
  } catch (e) {
    logError("startCampaign failed", e);
    return { message: "Saved, but the plan didn't start. Start it from Me → Plan." };
  }
  redirect("/today");
}
