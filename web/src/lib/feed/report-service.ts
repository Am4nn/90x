import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cardReviews, cards, profiles, topics } from "@/db/schema";
import { localDate } from "@/lib/tracker/dates";
import type { Db } from "@/lib/tracker/service";
import { type AreaRate, fillDays, type OverallReport } from "./report";
import { FEED_AREAS, type FeedArea } from "./view";

const isArea = (value: string | null): value is FeedArea => (FEED_AREAS as readonly (string | null)[]).includes(value);

/** The reader's lifetime numbers, by area and for the last seven local days. Graded
 *  answers only: correct or wrong. Days are the reader's own (profile time zone). */
export async function overallReport(userId: string, q: Db = db, now = new Date()): Promise<OverallReport> {
  const [profile] = await q.select({ timezone: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId));
  const tz = profile?.timezone ?? "UTC";
  const today = localDate(tz, now);
  const mine = eq(cardReviews.userId, userId);
  const graded = sql`${cardReviews.outcome} in ('correct', 'wrong')`;
  // Grouped by position: the same expression with its parameters repeated is not recognised as one.
  const day = sql<string>`((${cardReviews.createdAt} at time zone ${tz})::date)::text`;

  const [[life], byArea, byDay] = await Promise.all([
    q
      .select({
        answered: sql<number>`count(*) filter (where ${graded})::int`,
        correct: sql<number>`count(*) filter (where ${cardReviews.outcome} = 'correct')::int`,
        skipped: sql<number>`count(*) filter (where ${cardReviews.outcome} = 'skipped')::int`,
      })
      .from(cardReviews)
      .where(mine),
    q
      .select({
        area: topics.domain,
        answered: sql<number>`count(*)::int`,
        correct: sql<number>`count(*) filter (where ${cardReviews.outcome} = 'correct')::int`,
      })
      .from(cardReviews)
      .innerJoin(cards, eq(cards.id, cardReviews.cardId))
      .innerJoin(topics, eq(topics.slug, cards.topicSlug))
      .where(and(mine, graded))
      .groupBy(topics.domain),
    q
      .select({
        day,
        answered: sql<number>`count(*)::int`,
        correct: sql<number>`count(*) filter (where ${cardReviews.outcome} = 'correct')::int`,
      })
      .from(cardReviews)
      .where(and(mine, graded, sql`${cardReviews.createdAt} >= (${today}::date - 6)::timestamp at time zone ${tz}`))
      .groupBy(sql`1`),
  ]);

  const areas = byArea.flatMap((r): AreaRate[] => (isArea(r.area) ? [{ area: r.area, answered: r.answered, correct: r.correct }] : []));
  const days = fillDays(today, byDay);
  return {
    lifetime: { answered: life?.answered ?? 0, correct: life?.correct ?? 0, skipped: life?.skipped ?? 0 },
    today: days[6] ?? { answered: 0, correct: 0 },
    areas,
    days,
  };
}
