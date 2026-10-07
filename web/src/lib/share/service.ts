import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, days, shareCodes, userApprovals } from "@/db/schema";
import { localDate } from "@/lib/tracker/dates";
import { type Db, timezoneOf } from "@/lib/tracker/service";
import { buildCardModel, type CardModel } from "./card-data";
import { generateShareCode, isShareCode } from "./code";

// Runs on the server connection, which bypasses RLS: every query is scoped by hand, to the
// viewer's id or to the one user a well-formed code resolves to.

const ATTEMPTS = 5;

/** The user's code, made on first call. Safe to call twice at once: the loser reads the winner's row. */
export async function getOrCreateShareCode(userId: string, q: Db = db): Promise<string> {
  for (let i = 0; i < ATTEMPTS; i++) {
    const [existing] = await q.select({ code: shareCodes.code }).from(shareCodes).where(eq(shareCodes.userId, userId));
    if (existing) return existing.code;
    // A clash on the primary key (another tab won) or on the code (a 1 in 2.8 trillion draw) both
    // insert nothing; the next pass reads the winner's row or draws a new code.
    const [made] = await q
      .insert(shareCodes)
      .values({ userId, code: generateShareCode() })
      .onConflictDoNothing()
      .returning({ code: shareCodes.code });
    if (made) return made.code;
  }
  throw new Error("could not create a share code");
}

/** The card model for a user's active campaign, or null when they have none. Reads days, never missions. */
async function cardModelFor(userId: string, q: Db = db): Promise<CardModel | null> {
  const [c] = await q
    .select({ id: campaigns.id, startDate: campaigns.startDate, lengthDays: campaigns.lengthDays })
    .from(campaigns)
    .where(and(eq(campaigns.userId, userId), eq(campaigns.status, "active")));
  if (!c || !Number.isFinite(c.lengthDays)) return null;
  const rows = await q
    .select({ date: days.date, status: days.status })
    .from(days)
    .where(and(eq(days.userId, userId), eq(days.campaignId, c.id)));
  // "Today" comes from the same timezone lookup the Today page uses, so Day N matches the user's own grid.
  const today = localDate(await timezoneOf(userId, q));
  return buildCardModel({ startDate: c.startDate, lengthDays: c.lengthDays, today, rows });
}

/** The public lookup: a code to a card model. Null for a malformed or unknown code, an owner who is not
 *  approved, or an owner with no active campaign. */
export async function cardModelForCode(code: string, q: Db = db): Promise<CardModel | null> {
  if (!isShareCode(code)) return null;
  const [owner] = await q
    .select({ userId: shareCodes.userId })
    .from(shareCodes)
    .innerJoin(userApprovals, and(eq(userApprovals.userId, shareCodes.userId), eq(userApprovals.status, "approved")))
    .where(eq(shareCodes.code, code));
  return owner ? cardModelFor(owner.userId, q) : null;
}

/** One origin render of a public card, for admin Analytics. A single UPDATE; an unknown code changes nothing. */
export async function countCardView(code: string, q: Db = db): Promise<void> {
  await q
    .update(shareCodes)
    .set({ views: sql`${shareCodes.views} + 1` })
    .where(eq(shareCodes.code, code));
}

/** The owner shared, copied or downloaded their card, for admin Analytics. The caller caps it per day. */
export async function countShared(userId: string, q: Db = db): Promise<void> {
  await q
    .update(shareCodes)
    .set({ sharedCount: sql`${shareCodes.sharedCount} + 1` })
    .where(eq(shareCodes.userId, userId));
}

/** The viewer's own progress, for the share row on Me. */
export const shareSummary = cardModelFor;
