import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, problems, profiles } from "@/db/schema";
import { listedProblem } from "@/lib/library/listed";
import { timezoneOf } from "@/lib/tracker/service";
import { type CompanyFocus, carriedFocus, MAX_FOCUS_COMPANIES, cleanCompanies, focusRange, lengthError } from "./campaign-rules";
import { localDate } from "./dates";
import type { Level } from "./level";
import { proposeTemplate, type Templates } from "./template";

// Plan changes, always scoped to the signed-in user's id. The word "campaign"
// survives in these names on purpose: it is what the tables and the days rows
// are called, and none of it is user-facing.

export async function activeCampaign(userId: string) {
  const [c] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.userId, userId), eq(campaigns.status, "active")));
  return c ?? null;
}

/** Ends any active plan and starts a new one today with a proposed template.
 *  A level is only written when one is given: starting a plan must never erase
 *  a level someone chose, and no level at all is what every account that
 *  predates the column has. */
export async function startCampaign(
  userId: string,
  lengthDays: number,
  weekdayMinutes: number,
  weekendMinutes: number,
  level?: Level | null,
) {
  const today = localDate(await timezoneOf(userId));
  await db.transaction(async (tx) => {
    const [previous] = await tx
      .select({ companyFocus: campaigns.companyFocus })
      .from(campaigns)
      .where(and(eq(campaigns.userId, userId), eq(campaigns.status, "active")));
    await tx
      .update(campaigns)
      .set({ status: "ended" })
      .where(and(eq(campaigns.userId, userId), eq(campaigns.status, "active")));
    await tx.insert(campaigns).values({
      userId,
      startDate: today,
      lengthDays,
      templates: proposeTemplate(weekdayMinutes, weekendMinutes, level),
      companyFocus: carriedFocus(previous?.companyFocus, today, today),
    });
    await tx
      .update(profiles)
      .set({ weekdayMinutes, weekendMinutes, campaignDays: lengthDays, ...(level ? { level } : {}) })
      .where(eq(profiles.userId, userId));
  });
}

/** The level is a profile fact, not a plan one: it survives a plan ending. */
export async function setLevel(userId: string, level: Level): Promise<string | null> {
  await db.update(profiles).set({ level }).where(eq(profiles.userId, userId));
  return null;
}

export async function setLength(userId: string, lengthDays: number): Promise<string | null> {
  const c = await activeCampaign(userId);
  if (!c) return "Start a plan first.";
  const error = lengthError(c.startDate, localDate(await timezoneOf(userId)), lengthDays);
  if (error) return error;
  await db
    .update(campaigns)
    .set({ lengthDays })
    .where(and(eq(campaigns.id, c.id), eq(campaigns.userId, userId)));
  await db.update(profiles).set({ campaignDays: lengthDays }).where(eq(profiles.userId, userId));
  return null;
}

export async function setTemplates(userId: string, templates: Templates): Promise<string | null> {
  const c = await activeCampaign(userId);
  if (!c) return "Start a plan first.";
  await db
    .update(campaigns)
    .set({ templates })
    .where(and(eq(campaigns.id, c.id), eq(campaigns.userId, userId)));
  return null;
}

/** Rebuild the week from the times chosen now, and record the times. The level
 *  comes in already read, so it mixes the week the same way it did at the start. */
export async function setWeek(userId: string, weekdayMinutes: number, weekendMinutes: number, level: Level | null): Promise<string | null> {
  const c = await activeCampaign(userId);
  if (!c) return "Start a plan first.";
  await db
    .update(campaigns)
    .set({ templates: proposeTemplate(weekdayMinutes, weekendMinutes, level) })
    .where(and(eq(campaigns.id, c.id), eq(campaigns.userId, userId)));
  await db.update(profiles).set({ weekdayMinutes, weekendMinutes }).where(eq(profiles.userId, userId));
  return null;
}

export async function setCompanyFocus(userId: string, companies: string[], weeks: number): Promise<string | null> {
  const c = await activeCampaign(userId);
  if (!c) return "Start a plan first.";
  const clean = cleanCompanies(companies, await topCompanies(500));
  if (clean.length > MAX_FOCUS_COMPANIES) return `Pick at most ${MAX_FOCUS_COMPANIES} companies.`;
  const focus: CompanyFocus | null = clean.length ? { companies: clean, ...focusRange(localDate(await timezoneOf(userId)), weeks) } : null;
  await db
    .update(campaigns)
    .set({ companyFocus: focus })
    .where(and(eq(campaigns.id, c.id), eq(campaigns.userId, userId)));
  return null;
}

/** Companies with the most tagged problems, for the focus chips. */
export async function topCompanies(limit = 12): Promise<string[]> {
  const rows = await db.execute<{ company: string }>(sql`
    select key as company from ${problems}, jsonb_each(${problems.companies})
    where ${listedProblem}
    group by key order by count(*) desc limit ${limit}`);
  return rows.map((r) => r.company);
}
