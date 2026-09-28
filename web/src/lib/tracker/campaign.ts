import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, problems, profiles } from "@/db/schema";
import { timezoneOf } from "@/lib/tracker/service";
import { focusRange, lengthError } from "./campaign-rules";
import { localDate } from "./dates";
import { proposeTemplate, type Templates } from "./template";

// Campaign changes, always scoped to the signed-in user's id.

export async function activeCampaign(userId: string) {
  const [c] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.userId, userId), eq(campaigns.status, "active")));
  return c ?? null;
}

/** Ends any active campaign and starts a new one today with a proposed template. */
export async function startCampaign(userId: string, lengthDays: number, weekdayMinutes: number, weekendMinutes: number) {
  const today = localDate(await timezoneOf(userId));
  await db.transaction(async (tx) => {
    await tx
      .update(campaigns)
      .set({ status: "ended" })
      .where(and(eq(campaigns.userId, userId), eq(campaigns.status, "active")));
    await tx.insert(campaigns).values({ userId, startDate: today, lengthDays, templates: proposeTemplate(weekdayMinutes, weekendMinutes) });
    await tx.update(profiles).set({ weekdayMinutes, weekendMinutes, campaignDays: lengthDays }).where(eq(profiles.userId, userId));
  });
}

export async function setLength(userId: string, lengthDays: number): Promise<string | null> {
  const c = await activeCampaign(userId);
  if (!c) return "Start a campaign first.";
  const error = lengthError(c.startDate, localDate(await timezoneOf(userId)), lengthDays);
  if (error) return error;
  await db.update(campaigns).set({ lengthDays }).where(eq(campaigns.id, c.id));
  await db.update(profiles).set({ campaignDays: lengthDays }).where(eq(profiles.userId, userId));
  return null;
}

export async function setTemplates(userId: string, templates: Templates): Promise<string | null> {
  const c = await activeCampaign(userId);
  if (!c) return "Start a campaign first.";
  await db.update(campaigns).set({ templates }).where(eq(campaigns.id, c.id));
  return null;
}

export async function setCompanyFocus(userId: string, company: string | null, weeks: number): Promise<string | null> {
  const c = await activeCampaign(userId);
  if (!c) return "Start a campaign first.";
  const focus = company ? { company, ...focusRange(localDate(await timezoneOf(userId)), weeks) } : null;
  await db.update(campaigns).set({ companyFocus: focus }).where(eq(campaigns.id, c.id));
  return null;
}

/** Companies with the most tagged problems, for the focus chips. */
export async function topCompanies(limit = 12): Promise<string[]> {
  const rows = await db.execute<{ company: string }>(sql`
    select key as company from ${problems}, jsonb_each(${problems.companies})
    group by key order by count(*) desc limit ${limit}`);
  return rows.map((r) => r.company);
}
