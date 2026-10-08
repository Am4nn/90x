import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { xpEvents } from "@/db/schema";
import { weekStartOf } from "@/lib/coach/weekly-rules";
import { weekSeries, type XpDay } from "./series";

// What the app shows of XP: today's number, the running total and this week's days.
// Server connection, scoped by the userId the caller passes (the signed-in viewer).

/** XP earned on one local day. */
export async function xpOnDay(userId: string, day: string): Promise<number> {
  const [row] = await db
    .select({ xp: sql<number>`coalesce(sum(${xpEvents.xp}), 0)::int` })
    .from(xpEvents)
    .where(and(eq(xpEvents.userId, userId), eq(xpEvents.day, day)));
  return row?.xp ?? 0;
}

/** The lifetime total and this week, Monday to Sunday (zeros filled; see weekSeries). */
export async function xpSummary(userId: string, today: string): Promise<{ total: number; week: XpDay[] }> {
  // One read for both: this week's days so far one row each, everything else in a single
  // row with no day, so the total is the sum of every row.
  const from = weekStartOf(today);
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
