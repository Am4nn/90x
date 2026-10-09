import "server-only";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { checkins, integrationStatus, problems, profiles } from "@/db/schema";
import { FAILURES_BEFORE_BACKOFF } from "./backoff";
import type { Totals } from "./source";

/** The user's LeetCode username, or null. Without one, every Sync button offers to connect instead. */
export async function leetcodeUsername(userId: string): Promise<string | null> {
  const [row] = await db.select({ username: profiles.leetcodeUsername }).from(profiles).where(eq(profiles.userId, userId));
  return row?.username || null;
}

/** Whether the user has given a LeetCode username. */
export async function hasLeetcodeUsername(userId: string): Promise<boolean> {
  return (await leetcodeUsername(userId)) !== null;
}

export async function leetcodeStatus(userId: string) {
  const [row] = await db
    .select()
    .from(integrationStatus)
    .where(and(eq(integrationStatus.userId, userId), eq(integrationStatus.provider, "leetcode")));
  if (!row) return null;
  return {
    lastSuccessAt: row.lastSuccessAt,
    unavailable: row.consecutiveFailures >= FAILURES_BEFORE_BACKOFF,
    totals: (row.totals as Totals | null) ?? null,
  };
}

/**
 * The newest check-in LeetCode sync wrote for one problem, whichever sync wrote it:
 * the Sync button, the sync when the app opens, or the daily job. Null when sync
 * has never logged this problem.
 */
export async function latestSynced(userId: string, slug: string) {
  const [row] = await db
    .select({
      checkinId: checkins.id,
      result: checkins.result,
      attempts: checkins.attempts,
      minutes: checkins.minutes,
      minutesSuggested: checkins.minutesSuggested,
      at: checkins.createdAt,
    })
    .from(checkins)
    .where(and(eq(checkins.userId, userId), eq(checkins.problemSlug, slug), eq(checkins.source, "leetcode_sync")))
    .orderBy(desc(checkins.createdAt))
    .limit(1);
  return row ?? null;
}

/** Synced solves from the last week that still have no time recorded. */
export async function syncedWithoutTime(userId: string) {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  return db
    .select({
      id: checkins.id,
      title: problems.title,
      result: checkins.result,
      attempts: checkins.attempts,
      suggested: checkins.minutesSuggested,
    })
    .from(checkins)
    .innerJoin(problems, eq(problems.slug, checkins.problemSlug))
    .where(
      and(eq(checkins.userId, userId), eq(checkins.source, "leetcode_sync"), isNull(checkins.minutes), gt(checkins.createdAt, weekAgo)),
    )
    .orderBy(desc(checkins.createdAt))
    .limit(20);
}
