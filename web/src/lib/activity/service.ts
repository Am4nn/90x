import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { checkins, integrationStatus, problems, profiles } from "@/db/schema";
import { logError } from "@/lib/log";
import { onCheckins } from "@/lib/tracker/service";
import { FAILURES_BEFORE_BACKOFF, shouldSync } from "./backoff";
import { leetcode } from "./leetcode";
import { type ProblemActivitySource, UnknownUserError } from "./source";
import { summarize, type SyncedAttempt } from "./sync";

export const syncEnabled = () => process.env.LEETCODE_SYNC_ENABLED === "true";

export type SyncResult =
  | { status: "disabled" | "skipped" | "unknown_user" }
  | { status: "failed"; error: string; unavailable: boolean }
  | { status: "ok"; created: SyncedAttempt[]; notInLibrary: number };

/**
 * Pull recent submissions for one user and create the missing check-ins.
 * Uses the server connection (the Sync button, app-open and the QStash job
 * all come through here) and is always scoped to `userId`.
 */
export async function syncUser(userId: string, source: ProblemActivitySource = leetcode, now = new Date()): Promise<SyncResult> {
  if (!syncEnabled()) return { status: "disabled" };

  const [profile] = await db
    .select({
      username: profiles.leetcodeUsername,
      enabled: integrationStatus.enabled,
      failures: integrationStatus.consecutiveFailures,
      lastAttemptAt: integrationStatus.lastAttemptAt,
    })
    .from(profiles)
    .leftJoin(integrationStatus, and(eq(integrationStatus.userId, profiles.userId), eq(integrationStatus.provider, source.provider)))
    .where(eq(profiles.userId, userId));

  if (!profile?.username) return { status: "disabled" };
  const health = {
    enabled: profile.enabled ?? true,
    consecutiveFailures: profile.failures ?? 0,
    lastAttemptAt: profile.lastAttemptAt ? new Date(profile.lastAttemptAt) : null,
  };
  if (!shouldSync(health, now)) return { status: "skipped" };

  try {
    const [submissions, totals] = await Promise.all([source.recentSubmissions(profile.username), source.totals(profile.username)]);
    const attempts = summarize(submissions);
    const slugs = attempts.map((a) => a.slug);
    const known = new Set(
      slugs.length ? (await db.select({ slug: problems.slug }).from(problems).where(inArray(problems.slug, slugs))).map((r) => r.slug) : [],
    );

    const created: SyncedAttempt[] = [];
    const ticks: Parameters<typeof onCheckins>[1] = [];
    for (const a of attempts.filter((x) => known.has(x.slug))) {
      const rows = await db
        .insert(checkins)
        .values({
          userId,
          problemSlug: a.slug,
          result: a.result,
          attempts: a.attempts,
          minutesSuggested: a.minutesSuggested,
          source: "leetcode_sync",
          externalId: a.externalId,
          createdAt: new Date(a.at * 1000).toISOString(),
        })
        .onConflictDoNothing()
        .returning({ id: checkins.id, createdAt: checkins.createdAt });
      const [row] = rows;
      if (row) {
        created.push(a);
        ticks.push({ slug: a.slug, result: a.result, createdAt: row.createdAt, checkinId: row.id });
      }
    }

    await db
      .insert(integrationStatus)
      .values({
        userId,
        provider: source.provider,
        enabled: true,
        lastSuccessAt: now.toISOString(),
        lastAttemptAt: now.toISOString(),
        consecutiveFailures: 0,
        totals,
      })
      .onConflictDoUpdate({
        target: [integrationStatus.userId, integrationStatus.provider],
        set: { lastSuccessAt: now.toISOString(), lastAttemptAt: now.toISOString(), consecutiveFailures: 0, totals },
      });
    // Ticking missions must not count as a LeetCode failure.
    await onCheckins(userId, ticks).catch((e) => logError("tracker: ticking after sync failed", e));
    return { status: "ok", created, notInLibrary: attempts.length - known.size };
  } catch (e) {
    // A mistyped username isn't an outage: say so now instead of counting it towards the backoff.
    if (e instanceof UnknownUserError) return { status: "unknown_user" };
    const [row] = await db
      .insert(integrationStatus)
      .values({ userId, provider: source.provider, lastAttemptAt: now.toISOString(), consecutiveFailures: 1 })
      .onConflictDoUpdate({
        target: [integrationStatus.userId, integrationStatus.provider],
        set: { lastAttemptAt: now.toISOString(), consecutiveFailures: sql`${integrationStatus.consecutiveFailures} + 1` },
      })
      .returning({ failures: integrationStatus.consecutiveFailures });
    return { status: "failed", error: (e as Error).message, unavailable: (row?.failures ?? 1) >= FAILURES_BEFORE_BACKOFF };
  }
}

const noUsername = sql`(${profiles.leetcodeUsername} is null or ${profiles.leetcodeUsername} = '')`;

/** Saves a username for someone who has none. False when one is already set: a username, once
 *  given (at Set up or later), is never replaced here. */
export async function saveUsername(userId: string, username: string): Promise<boolean> {
  const rows = await db
    .update(profiles)
    .set({ leetcodeUsername: username })
    .where(and(eq(profiles.userId, userId), noUsername))
    .returning({ id: profiles.userId });
  return rows.length > 0;
}

/** Takes back a username `saveUsername` just stored, when LeetCode says it doesn't exist. Its sync
 *  status goes too: there was no username before it, so any failures there are this name's, and
 *  left behind they could pause the next, real username's first sync (shouldSync's backoff). */
export async function dropUsername(userId: string, username: string) {
  await db.transaction(async (tx) => {
    const dropped = await tx
      .update(profiles)
      .set({ leetcodeUsername: null })
      .where(and(eq(profiles.userId, userId), eq(profiles.leetcodeUsername, username)))
      .returning({ id: profiles.userId });
    if (dropped.length) {
      await tx
        .delete(integrationStatus)
        .where(and(eq(integrationStatus.userId, userId), eq(integrationStatus.provider, leetcode.provider)));
    }
  });
}

/** Every user with a LeetCode username (for the scheduled job). */
export async function usersToSync(): Promise<string[]> {
  const rows = await db
    .select({ id: profiles.userId })
    .from(profiles)
    .where(sql`${profiles.leetcodeUsername} is not null and ${profiles.leetcodeUsername} <> ''`);
  return rows.map((r) => r.id);
}
