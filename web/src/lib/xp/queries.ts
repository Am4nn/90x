import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { xpEvents } from "@/db/schema";
import { addDays } from "@/lib/tracker/dates";
import { weekSeries, type XpDay } from "./series";

// What the app shows of XP: today's number, the running total and a week of days.
// Server connection, scoped by the userId the caller passes (the signed-in viewer).

/** XP earned on one local day. */
export async function xpOnDay(userId: string, day: string): Promise<number> {
  const [row] = await db
    .select({ xp: sql<number>`coalesce(sum(${xpEvents.xp}), 0)::int` })
    .from(xpEvents)
    .where(and(eq(xpEvents.userId, userId), eq(xpEvents.day, day)));
  return row?.xp ?? 0;
}

/** The lifetime total and the last seven local days (oldest first, zeros filled). */
export async function xpSummary(userId: string, today: string): Promise<{ total: number; week: XpDay[] }> {
  // One read for both: the last seven days one row each, everything else in a single
  // row with no day, so the total is the sum of every row.
  const from = addDays(today, -6);
  const rows = await db
    .select({
      day: sql<string | null>`case when ${xpEvents.day} between ${from} and ${today} then ${xpEvents.day} end`,
      xp: sql<number>`sum(${xpEvents.xp})::int`,
    })
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId))
    .groupBy(sql`1`);
  const recent = rows.flatMap((r) => (r.day === null ? [] : [{ day: r.day, xp: r.xp }]));
  return { total: rows.reduce((n, r) => n + r.xp, 0), week: weekSeries(recent, today) };
}
