"use server";

import { headers } from "next/headers";
import type { FormState } from "@/components/form";
import { db } from "@/db";
import { problemReports } from "@/db/schema";
import { getViewer } from "@/lib/auth/viewer";
import { sendEmailBestEffort } from "@/lib/email";
import { problemReportEmail } from "@/lib/email/templates";
import { logError } from "@/lib/log";
import { parseReport, SUPPORT_EMAIL } from "@/lib/trust/report-rules";
import { takeSlot } from "@/lib/upstash/rate-limit";

/** Saves a problem report and tells the owner. The page, browser and version come from the request,
 *  not the form, so they cannot be wrong or missing. */
export async function sendReport(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "You are signed out. Sign in again to send a report." };
  const parsed = parseReport({ message: form.get("message"), doing: form.get("doing"), from: form.get("from") });
  if ("error" in parsed) return { error: parsed.error };
  const { report } = parsed;

  const slot = await takeSlot(viewer.id, "report");
  if (!slot.allowed)
    return {
      error: `That's a lot of reports. You can send more in ${Math.max(1, Math.ceil(slot.retryAfterSec / 60))} min, or email ${SUPPORT_EMAIL}.`,
    };

  const userAgent = ((await headers()).get("user-agent") ?? "").slice(0, 500) || null;
  const appVersion = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null;
  try {
    await db.insert(problemReports).values({ userId: viewer.id, ...report, userAgent, appVersion });
  } catch (e) {
    logError("problem report not saved", e);
    return { error: `Couldn't send that. Try again, or email ${SUPPORT_EMAIL}.` };
  }
  // The report is already saved; a mail outage only means the owner finds it in /admin/reports.
  await sendEmailBestEffort({
    actorId: viewer.id,
    kind: "problem-report",
    email: problemReportEmail(SUPPORT_EMAIL, { from: viewer.email ?? viewer.id, ...report, userAgent, appVersion }),
    payload: { path: report.path },
  });
  return { ok: true };
}
