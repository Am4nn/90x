import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { key } from "@/lib/upstash/keys";
import { redis } from "@/lib/upstash/redis";
import { sendSpendAlerts } from "./alerts";
import { type BudgetState, budgetState, costUsd } from "./cost";

// Every AI call from the app is logged to ai_usage and added to Redis meters (this
// month, today, and today per person), so the guard's check is a few reads instead
// of a table scan. ai_usage is the record; the meters are a cache of it. A meter
// that is missing or unreadable is rebuilt from the table, so a Redis restart can
// never reset what has been spent.
//
// Days and months are UTC, the same on every server.

const MONTH_SECONDS = 40 * 24 * 60 * 60;
const DAY_SECONDS = 3 * 24 * 60 * 60;
const LIFETIME_SECONDS = 400 * 24 * 60 * 60;

const monthKey = (now = new Date()) => key("ai", "spend", now.toISOString().slice(0, 7));
const lifetimeKey = () => key("ai", "spend", "lifetime");
const dayKey = (now = new Date()) => key("ai", "spend", "day", now.toISOString().slice(0, 10));
const userDayKey = (userId: string, now = new Date()) => key("ai", "spend", "user", userId, now.toISOString().slice(0, 10));

/** Spend since the start of the current UTC day or month, from the table, optionally for one person. */
async function fromTable(unit: "day" | "month" | "all", userId?: string): Promise<number> {
  const since =
    unit === "all" ? sql`timestamptz '-infinity'` : sql`date_trunc(${sql.raw(`'${unit}'`)}, now() at time zone 'utc') at time zone 'utc'`;
  const who = userId ? sql`and user_id = ${userId}` : sql``;
  const rows = (await db.execute(
    sql`select coalesce(sum(cost_usd), 0)::float as total from ${aiUsage} where created_at >= ${since} ${who}`,
  )) as unknown as { total: number }[];
  return Number(rows[0]?.total) || 0;
}

/** One meter: Redis when it has the key, otherwise the table (and the answer is put back in Redis). */
async function readMeter(k: string, rebuild: () => Promise<number>, ttl: number): Promise<number> {
  let redisUp = true;
  try {
    const stored = await redis().get<number | string>(k);
    if (stored !== null && stored !== undefined) return Number(stored) || 0;
  } catch (e) {
    redisUp = false;
    console.error("ai meter unreadable, using the table", e);
  }
  let total: number;
  try {
    total = await rebuild();
  } catch (e) {
    // Nothing can tell us what has been spent. The caller treats this as zero: the per-person
    // windows still hold, and the provider's own limit is the backstop.
    console.error("ai spend unreadable", e);
    return 0;
  }
  if (redisUp)
    await redis()
      .set(k, total, { nx: true, ex: ttl })
      .catch(() => null);
  return total;
}

/** Add one call's cost to a meter, rebuilding it from the table first if it is not there. Returns the new total. */
async function bump(k: string, cost: number, rebuild: () => Promise<number>, ttl: number): Promise<number> {
  if (!(await redis().exists(k))) {
    const total = await rebuild(); // the row for this call is already in the table
    if ((await redis().set(k, total, { nx: true, ex: ttl })) === "OK") return total;
  }
  const next = await redis().incrbyfloat(k, cost);
  await redis().expire(k, ttl);
  return next;
}

export async function recordUsage(entry: { userId: string | null; route: string; model: string; tokensIn: number; tokensOut: number }) {
  const cost = costUsd(entry.model, entry.tokensIn, entry.tokensOut);
  try {
    // numeric(10,6): Drizzle carries numerics as strings so no digit is lost on the way in.
    await db.insert(aiUsage).values({ ...entry, costUsd: cost.toFixed(6) });
    const now = new Date();
    const userId = entry.userId;
    const [month, day, lifetime] = await Promise.all([
      bump(monthKey(now), cost, () => fromTable("month"), MONTH_SECONDS),
      bump(dayKey(now), cost, () => fromTable("day"), DAY_SECONDS),
      bump(lifetimeKey(), cost, () => fromTable("all"), LIFETIME_SECONDS),
      userId ? bump(userDayKey(userId, now), cost, () => fromTable("day", userId), DAY_SECONDS) : null,
    ]);
    await sendSpendAlerts({ day, month, lifetime }, now);
  } catch (e) {
    // A logging failure must never fail the answer being graded.
    console.error("ai usage not recorded", e);
  }
  return cost;
}

export type SpendNow = { day: number; month: number; userDay: number; lifetime: number };

/** What has been spent today, this month and ever, and today by this person when given. */
export async function readSpend(userId?: string | null, now = new Date()): Promise<SpendNow> {
  const [day, month, lifetime, userDay] = await Promise.all([
    readMeter(dayKey(now), () => fromTable("day"), DAY_SECONDS),
    readMeter(monthKey(now), () => fromTable("month"), MONTH_SECONDS),
    readMeter(lifetimeKey(), () => fromTable("all"), LIFETIME_SECONDS),
    userId ? readMeter(userDayKey(userId, now), () => fromTable("day", userId), DAY_SECONDS) : 0,
  ]);
  return { day, month, userDay, lifetime };
}

/** The month against its cap, for the admin home. The cap is the admin's setting, not an env value. */
export async function budget(): Promise<{ spent: number; limit: number; state: BudgetState }> {
  const [settings, spend] = await Promise.all([getSettings(), readSpend()]);
  return { spent: spend.month, limit: settings.aiMonthlyCapUsd, state: budgetState(spend.month, settings.aiMonthlyCapUsd) };
}
