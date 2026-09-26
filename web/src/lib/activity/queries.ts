import "server-only";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { checkins, integrationStatus, problems } from "@/db/schema";
import { FAILURES_BEFORE_BACKOFF } from "./backoff";
import type { Totals } from "./source";

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
    .where(and(eq(checkins.userId, userId), eq(checkins.source, "leetcode_sync"), isNull(checkins.minutes), gt(checkins.createdAt, weekAgo)))
    .orderBy(desc(checkins.createdAt))
    .limit(20);
}
