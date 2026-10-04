import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cardRatings } from "@/db/schema";
import type { Db } from "@/lib/tracker/service";

/** Sets this reader's rating of a card, or clears it with null. One row per reader per card. */
export async function setRating(userId: string, cardId: string, stars: number | null, q: Db = db): Promise<void> {
  if (stars === null) {
    await q.delete(cardRatings).where(and(eq(cardRatings.userId, userId), eq(cardRatings.cardId, cardId)));
    return;
  }
  await q
    .insert(cardRatings)
    .values({ userId, cardId, stars })
    .onConflictDoUpdate({ target: [cardRatings.userId, cardRatings.cardId], set: { stars, updatedAt: sql`now()` } });
}
