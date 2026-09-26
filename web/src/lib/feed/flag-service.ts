import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { cardFlags, cardReviews, cards } from "@/db/schema";
import type { Db } from "@/lib/tracker/service";
import { FLAGS_TO_HIDE, shouldHideStale } from "./flags";

/** A user reports a card. One flag per user per card; two flags hide it. */
export async function reportCard(userId: string, cardId: string, reason: string, q: Db = db) {
  await q
    .insert(cardFlags)
    .values({ userId, cardId, reason })
    .onConflictDoUpdate({ target: [cardFlags.userId, cardFlags.cardId], set: { reason, createdAt: sql`now()` } });
  const [count] = await q
    .select({ n: sql<number>`count(*)::int` })
    .from(cardFlags)
    .where(eq(cardFlags.cardId, cardId));
  const n = count?.n ?? 0;
  await q
    .update(cards)
    .set({ flagCount: n, ...(n >= FLAGS_TO_HIDE ? { hidden: true } : {}) })
    .where(eq(cards.id, cardId));
  return { flags: n, hidden: n >= FLAGS_TO_HIDE };
}

/** Daily sweep: hide live cards that everyone who met them skipped for 14 days. */
export async function hideStaleCards(now = new Date(), q: Db = db): Promise<number> {
  const rows = await q
    .select({
      cardId: cardReviews.cardId,
      answers: sql<number>`count(*)::int`,
      skips: sql<number>`count(*) filter (where ${cardReviews.outcome} = 'skipped')::int`,
      firstSeen: sql<string>`min(${cardReviews.createdAt})`,
    })
    .from(cardReviews)
    .innerJoin(cards, and(eq(cards.id, cardReviews.cardId), eq(cards.status, "live"), eq(cards.hidden, false)))
    .groupBy(cardReviews.cardId);
  const stale = rows
    .filter((r) =>
      shouldHideStale({
        answers: r.answers,
        skips: r.skips,
        firstSeenDaysAgo: Math.floor((now.getTime() - new Date(r.firstSeen).getTime()) / 86_400_000),
      }),
    )
    .map((r) => r.cardId);
  if (stale.length) await q.update(cards).set({ hidden: true }).where(inArray(cards.id, stale));
  return stale.length;
}
