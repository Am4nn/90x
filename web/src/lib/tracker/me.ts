import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, checkins, days, mocks, problems, profiles, readinessSnapshots, userApprovals } from "@/db/schema";
import { friendIds, otherFriendIds } from "@/lib/friends/service";
import { patternMap } from "@/lib/library/queries";
import { addDays, localDate } from "./dates";
import { streak } from "./days";
import { weakestPatterns } from "./me-rules";
import { type Db, snapshotReadiness } from "./service";

// Data for the Me dashboard. Friends' data is limited to what the app makes
// public: readiness, streak, day squares, check-ins without notes, and mock
// type, topic and score (never the transcript or feedback in mock_details).

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

export type PersonRow = {
  userId: string;
  name: string;
  isMe: boolean;
  readiness: number | null;
  streak: number;
  solvedThisWeek: number;
  lastMock: number | null;
};

/** You and your accepted friends, side by side. Includes only approved users. */
export async function scoreboard(viewerId: string, q: Db = db): Promise<PersonRow[]> {
  const ids = await friendIds(viewerId, q);
  if (!ids.length) return [];
  const people = await q
    .select({ userId: profiles.userId, name: profiles.name, timezone: profiles.timezone })
    .from(profiles)
    .innerJoin(userApprovals, eq(userApprovals.userId, profiles.userId))
    .where(and(inArray(profiles.userId, ids), eq(userApprovals.status, "approved"), sql`${profiles.setupDoneAt} is not null`));
  if (!people.length) return [];
  const peopleIds = people.map((p) => p.userId);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [snaps, dayRows, solved, lastMocks] = await Promise.all([
    q
      .selectDistinctOn([readinessSnapshots.userId], { userId: readinessSnapshots.userId, overall: readinessSnapshots.overall })
      .from(readinessSnapshots)
      .where(inArray(readinessSnapshots.userId, peopleIds))
      .orderBy(readinessSnapshots.userId, desc(readinessSnapshots.date)),
    // Only the active campaign's days, like the streak on Today.
    q
      .select({ userId: days.userId, date: days.date, status: days.status })
      .from(days)
      .innerJoin(campaigns, and(eq(campaigns.id, days.campaignId), eq(campaigns.userId, days.userId), eq(campaigns.status, "active")))
      .where(inArray(days.userId, peopleIds)),
    q
      .select({ userId: checkins.userId, n: sql<number>`count(distinct ${checkins.problemSlug})::int` })
      .from(checkins)
      .where(and(inArray(checkins.userId, peopleIds), eq(checkins.result, "solved"), gte(checkins.createdAt, weekAgo)))
      .groupBy(checkins.userId),
    q
      .selectDistinctOn([mocks.userId], { userId: mocks.userId, score: mocks.score })
      .from(mocks)
      .where(and(inArray(mocks.userId, peopleIds), eq(mocks.status, "done")))
      .orderBy(mocks.userId, desc(mocks.startedAt)),
  ]);
  const readiness = new Map(snaps.map((s) => [s.userId, s.overall]));
  const lastMock = new Map(lastMocks.map((m) => [m.userId, m.score]));
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
      lastMock: lastMock.get(p.userId) ?? null,
    }))
    .toSorted((a, b) => Number(b.isMe) - Number(a.isMe) || (b.readiness ?? -1) - (a.readiness ?? -1));
}

/** Friends' latest check-ins. Never includes notes (they live in checkin_notes). */
export async function friendActivity(viewerId: string, limit = 8) {
  const otherIds = await otherFriendIds(viewerId);
  if (!otherIds.length) return [];
  return db
    .select({
      id: checkins.id,
      // First name only: the query decides, not the component.
      name: sql<string>`split_part(${profiles.name}, ' ', 1)`,
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
    .where(inArray(checkins.userId, otherIds))
    .orderBy(desc(checkins.createdAt))
    .limit(limit);
}

/** Friends' latest finished mocks: type, topic and score only. */
export async function friendMocks(viewerId: string, limit = 8) {
  const otherIds = await otherFriendIds(viewerId);
  if (!otherIds.length) return [];
  return db
    .select({
      id: mocks.id,
      // First name only: the query decides, not the component.
      name: sql<string>`split_part(${profiles.name}, ' ', 1)`,
      type: mocks.type,
      topic: mocks.topic,
      score: mocks.score,
      endedAt: mocks.endedAt,
    })
    .from(mocks)
    .innerJoin(profiles, eq(profiles.userId, mocks.userId))
    .innerJoin(userApprovals, and(eq(userApprovals.userId, mocks.userId), eq(userApprovals.status, "approved")))
    .where(and(inArray(mocks.userId, otherIds), eq(mocks.status, "done")))
    .orderBy(desc(mocks.endedAt))
    .limit(limit);
}
