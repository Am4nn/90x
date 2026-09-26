import "server-only";
import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { checkins, days, problems, profiles, readinessSnapshots, userApprovals } from "@/db/schema";
import { patternMap } from "@/lib/library/queries";
import { addDays, localDate } from "./dates";
import { streak } from "./days";
import { weakestPatterns } from "./me-rules";
import { snapshotReadiness } from "./service";

// Data for the Me dashboard. Friends' data is limited to what the app makes
// public: readiness, streak, day squares and check-ins without notes.

export type AreaRow = { key: string; coverage: number; score: number | null };

export async function myDashboard(userId: string, timezone: string) {
  const today = localDate(timezone);
  const current = await snapshotReadiness(userId, today);
  const [trend, map] = await Promise.all([
    db
      .select({ date: readinessSnapshots.date, overall: readinessSnapshots.overall })
      .from(readinessSnapshots)
      .where(and(eq(readinessSnapshots.userId, userId), gte(readinessSnapshots.date, addDays(today, -13))))
      .orderBy(readinessSnapshots.date),
    patternMap(userId),
  ]);
  const areas: AreaRow[] = Object.entries(current.perArea).map(([key, v]) => ({ key, coverage: v.coverage, score: v.score }));
  return { today, overall: current.overall, areas, trend, weakest: weakestPatterns(map.patterns, 3) };
}

export type PersonRow = { userId: string; name: string; isMe: boolean; readiness: number | null; streak: number; solvedThisWeek: number };

/** You and every approved friend, side by side. */
export async function scoreboard(viewerId: string): Promise<PersonRow[]> {
  const people = await db
    .select({ userId: profiles.userId, name: profiles.name, timezone: profiles.timezone })
    .from(profiles)
    .innerJoin(userApprovals, eq(userApprovals.userId, profiles.userId))
    .where(and(eq(userApprovals.status, "approved"), sql`${profiles.setupDoneAt} is not null`));
  if (!people.length) return [];
  const ids = people.map((p) => p.userId);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [snaps, dayRows, solved] = await Promise.all([
    db
      .selectDistinctOn([readinessSnapshots.userId], { userId: readinessSnapshots.userId, overall: readinessSnapshots.overall })
      .from(readinessSnapshots)
      .where(inArray(readinessSnapshots.userId, ids))
      .orderBy(readinessSnapshots.userId, desc(readinessSnapshots.date)),
    db
      .select({ userId: days.userId, date: days.date, status: days.status })
      .from(days)
      .where(and(inArray(days.userId, ids), gte(days.date, addDays(localDate("UTC"), -120)))),
    db
      .select({ userId: checkins.userId, n: sql<number>`count(distinct ${checkins.problemSlug})::int` })
      .from(checkins)
      .where(and(inArray(checkins.userId, ids), eq(checkins.result, "solved"), gte(checkins.createdAt, weekAgo)))
      .groupBy(checkins.userId),
  ]);
  const readiness = new Map(snaps.map((s) => [s.userId, s.overall]));
  const solvedBy = new Map(solved.map((s) => [s.userId, s.n]));
  return people
    .map((p) => ({
      userId: p.userId,
      name: p.userId === viewerId ? "You" : p.name.split(" ")[0] || "Friend",
      isMe: p.userId === viewerId,
      readiness: readiness.get(p.userId) ?? null,
      streak: streak(
        dayRows.filter((d) => d.userId === p.userId),
        localDate(p.timezone),
      ),
      solvedThisWeek: solvedBy.get(p.userId) ?? 0,
    }))
    .toSorted((a, b) => Number(b.isMe) - Number(a.isMe) || (b.readiness ?? -1) - (a.readiness ?? -1));
}

/** Friends' latest check-ins. Never includes notes (they live in checkin_notes). */
export async function friendActivity(viewerId: string, limit = 8) {
  return db
    .select({
      id: checkins.id,
      name: profiles.name,
      title: problems.title,
      slug: problems.slug,
      result: checkins.result,
      minutes: checkins.minutes,
      createdAt: checkins.createdAt,
    })
    .from(checkins)
    .innerJoin(profiles, eq(profiles.userId, checkins.userId))
    .innerJoin(userApprovals, and(eq(userApprovals.userId, checkins.userId), eq(userApprovals.status, "approved")))
    .innerJoin(problems, eq(problems.slug, checkins.problemSlug))
    .where(ne(checkins.userId, viewerId))
    .orderBy(desc(checkins.createdAt))
    .limit(limit);
}
