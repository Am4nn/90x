import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
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
  const [[all], recent] = await Promise.all([
    db
      .select({ xp: sql<number>`coalesce(sum(${xpEvents.xp}), 0)::int` })
      .from(xpEvents)
      .where(eq(xpEvents.userId, userId)),
    db
      .select({ day: xpEvents.day, xp: sql<number>`sum(${xpEvents.xp})::int` })
      .from(xpEvents)
      .where(and(eq(xpEvents.userId, userId), gte(xpEvents.day, addDays(today, -6)), lte(xpEvents.day, today)))
      .groupBy(xpEvents.day),
  ]);
  return { total: all?.xp ?? 0, week: weekSeries(recent, today) };
}
