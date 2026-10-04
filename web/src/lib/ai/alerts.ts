import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { sendEmailBestEffort } from "@/lib/email";
import { getSettings } from "@/lib/settings";
import { key } from "@/lib/upstash/keys";
import { redis } from "@/lib/upstash/redis";
import { type Alert, alertsFor, alertText } from "./guard-rules";

// One email to the admins the first time a cap reaches 80%, and again when it reaches
// twice the cap, once per day or month. The Redis NX key is what makes it once: whoever
// sets it first sends, everyone else does nothing.

const DAY_SECONDS = 2 * 24 * 60 * 60;
const MONTH_SECONDS = 40 * 24 * 60 * 60;
const LIFETIME_SECONDS = 400 * 24 * 60 * 60;

async function adminEmails(): Promise<string[]> {
  const rows = (await db.execute(sql`
    select u.email from public.user_approvals a join auth.users u on u.id = a.user_id
    where a.is_admin and a.status = 'approved' and u.email is not null`)) as unknown as { email: string }[];
  return rows.map((r) => r.email);
}

async function claim(alert: Alert, now: Date): Promise<boolean> {
  const stamp = alert.period === "day" ? now.toISOString().slice(0, 10) : alert.period === "month" ? now.toISOString().slice(0, 7) : "all";
  const k = key("ai", "alert", alert.period, stamp, alert.level);
  return (
    (await redis().set(k, "1", {
      nx: true,
      ex: alert.period === "day" ? DAY_SECONDS : alert.period === "month" ? MONTH_SECONDS : LIFETIME_SECONDS,
    })) === "OK"
  );
}

/** Called after spend is recorded, with the new day and month totals. Never throws. */
export async function sendSpendAlerts(totals: { day: number; month: number; lifetime: number }, now = new Date()): Promise<void> {
  try {
    const settings = await getSettings();
    for (const alert of alertsFor(settings, totals)) {
      if (!(await claim(alert, now))) continue;
      const { subject, body } = alertText(alert, settings.aiHardStop);
      for (const to of await adminEmails()) {
        await sendEmailBestEffort({
          actorId: "system",
          kind: "ai-spend-alert",
          email: { to, subject, text: body, html: `<p>${body}</p>` },
          payload: { period: alert.period, level: alert.level, spent: alert.spent, cap: alert.cap },
        });
      }
    }
  } catch (e) {
    console.error("ai spend alert failed", e);
  }
}
