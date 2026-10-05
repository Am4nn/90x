import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { xpEvents } from "@/db/schema";
import { capCard, type CardUsed, type XpAward } from "./rules";

// The one place XP is written. Server connection, so it bypasses RLS: every call
// names the user, and the caller passes the reader's local day (never UTC).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;

/** The card XP already earned on a day, rule-graded and model-graded together and the model's share. */
async function cardUsed(tx: Tx, userId: string, day: string): Promise<CardUsed> {
  const rows = await tx
    .select({ kind: xpEvents.kind, xp: sql<number>`coalesce(sum(${xpEvents.xp}), 0)::int` })
    .from(xpEvents)
    .where(and(eq(xpEvents.userId, userId), eq(xpEvents.day, day), inArray(xpEvents.kind, ["card", "card_ai"])))
    .groupBy(xpEvents.kind);
  const of = (kind: string) => rows.find((r) => r.kind === kind)?.xp ?? 0;
  return { total: of("card") + of("card_ai"), ai: of("card_ai") };
}

/**
 * Award XP once. Returns what was actually granted: 0 when the same thing
 * already earned on that day (or, for a problem or topic, ever), or when a card's
 * daily cap is used up.
 *
 * Idempotent through the unique key (user, kind, ref, day) and `on conflict do
 * nothing`. The card caps are read and enforced inside one transaction under a
 * per-user-and-day lock, so two answers arriving together cannot both squeeze
 * under the cap.
 *
 * It never throws: a failure to award is logged and counts as 0. The action that
 * earned the points has already happened and must not fail because of them, and
 * the work runs in its own (nested) transaction so a failed insert cannot abort
 * the caller's.
 */
export async function awardXp(q: Db, userId: string, day: string, award: XpAward): Promise<number> {
  if (award.xp <= 0) return 0;
  try {
    return await q.transaction(async (tx) => {
      let xp = award.xp;
      if (award.kind === "card" || award.kind === "card_ai") {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`xp:${userId}:${day}`}))`);
        xp = capCard({ kind: award.kind, xp }, await cardUsed(tx, userId, day));
        if (xp <= 0) return 0;
      }
      const inserted = await tx
        .insert(xpEvents)
        .values({ userId, day, kind: award.kind, ref: award.ref, xp })
        .onConflictDoNothing()
        .returning({ id: xpEvents.id });
      return inserted.length ? xp : 0;
    });
  } catch (e) {
    console.error("xp not awarded", e);
    return 0;
  }
}

/** Take back a topic's studied XP when the reader un-marks it, so undoing leaves no stale award. */
export async function revokeTopicXp(q: Db, userId: string, topicSlug: string): Promise<void> {
  await q.delete(xpEvents).where(and(eq(xpEvents.userId, userId), eq(xpEvents.kind, "topic"), eq(xpEvents.ref, topicSlug)));
}
