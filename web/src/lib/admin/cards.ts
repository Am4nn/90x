import "server-only";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { batchReviewItems, cardBatches, cardFlags, cardRatings, cards, profiles, topics } from "@/db/schema";
import { archetype, type ArchetypeId } from "@/lib/feed/archetypes";
import { parseConstraints, parsePairs, parsePicked, parseWhyStep } from "@/lib/feed/grade";
import { parseOptions } from "@/lib/feed/options";
import { pickReviewSample, SAMPLE_SIZE } from "@/lib/feed/review-sample";
import { isPrimitive } from "@/lib/feed/view";
import { parseQuality, seedFromId, sourceTitles, stringList, type Verdict } from "./review";

// Admin-only reads for /admin/cards. The server connection bypasses RLS, so
// callers must check viewer.isAdmin before using any of these.

type Reader = Pick<typeof db, "select">;

export type BatchStatus = "draft" | "published" | "rejected";

export async function listBatches() {
  const rows = await db
    .select({
      id: cardBatches.id,
      label: cardBatches.label,
      domain: cardBatches.domain,
      aiPassRate: cardBatches.aiPassRate,
      status: cardBatches.status,
      reviewedAt: cardBatches.reviewedAt,
      // Correlated subqueries spell out table names: Drizzle renders a column as
      // a bare "id", which inside the subquery would mean the subquery's own table.
      cardCount: sql<number>`(select count(*)::int from public.cards c where c.batch_id = "card_batches"."id")`,
      draftCount: sql<number>`(select count(*)::int from public.cards c where c.batch_id = "card_batches"."id" and c.status = 'draft')`,
      good: sql<number>`(select count(*)::int from public.batch_review_items r where r.batch_id = "card_batches"."id" and r.verdict = 'good')`,
      bad: sql<number>`(select count(*)::int from public.batch_review_items r where r.batch_id = "card_batches"."id" and r.verdict = 'bad')`,
    })
    .from(cardBatches)
    .orderBy(asc(cardBatches.label), asc(cardBatches.createdAt));
  return rows.map((r) => ({
    ...r,
    label: r.label || r.domain,
    status: r.status as BatchStatus,
    sampleSize: Math.min(SAMPLE_SIZE, r.cardCount),
  }));
}

export type BatchRow = Awaited<ReturnType<typeof listBatches>>[number];

/** The batch's review sample, in review order. Every card in the batch takes
 *  part, whatever its status, so the sample never shifts after publishing. */
export async function sampleIds(batchId: string, q: Reader = db): Promise<string[]> {
  const all = await q.select({ id: cards.id, risk: cards.risk }).from(cards).where(eq(cards.batchId, batchId));
  return pickReviewSample(all, seedFromId(batchId));
}

export async function batchForReview(batchId: string) {
  const [batch] = await db
    .select({
      id: cardBatches.id,
      label: cardBatches.label,
      domain: cardBatches.domain,
      status: cardBatches.status,
      aiPassRate: cardBatches.aiPassRate,
      reviewedAt: cardBatches.reviewedAt,
    })
    .from(cardBatches)
    .where(eq(cardBatches.id, batchId));
  if (!batch) return null;

  const ids = await sampleIds(batchId);
  const [rows, verdicts] = await Promise.all([
    ids.length === 0
      ? []
      : db
          .select({
            id: cards.id,
            format: cards.format,
            archetype: cards.archetype,
            difficulty: cards.difficulty,
            promptMd: cards.promptMd,
            options: cards.options,
            answerMd: cards.answerMd,
            keyPoints: cards.keyPoints,
            picked: cards.picked,
            constraints: cards.constraints,
            pairs: cards.pairs,
            value: cards.value,
            tolerance: cards.tolerance,
            whyStep: cards.whyStep,
            sourceRefs: cards.sourceRefs,
            quality: cards.quality,
            topicSlug: cards.topicSlug,
            topicName: topics.name,
            domain: topics.domain,
          })
          .from(cards)
          .leftJoin(topics, eq(topics.slug, cards.topicSlug))
          .where(inArray(cards.id, ids)),
    db
      .select({ cardId: batchReviewItems.cardId, verdict: batchReviewItems.verdict, note: batchReviewItems.note })
      .from(batchReviewItems)
      .where(eq(batchReviewItems.batchId, batchId)),
  ]);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const verdictById = new Map(verdicts.map((v) => [v.cardId, v]));
  const sample = ids.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    const v = verdictById.get(id);
    const arch = r.archetype ? archetype(r.archetype as ArchetypeId) : undefined;
    const primitive = isPrimitive(r.format) ? r.format : null;
    return [
      {
        id: r.id,
        format: r.format,
        primitive,
        archetype: arch?.id ?? null,
        archetypeLabel: arch?.label ?? null,
        difficulty: r.difficulty,
        promptMd: r.promptMd,
        options: parseOptions(primitive, r.options),
        answerMd: r.answerMd,
        keyPoints: stringList(r.keyPoints),
        picked: parsePicked(r.picked),
        constraints: parseConstraints(r.constraints),
        pairs: parsePairs(r.pairs),
        value: r.value,
        tolerance: r.tolerance,
        whyStep: parseWhyStep(r.whyStep),
        sources: sourceTitles(r.sourceRefs),
        quality: parseQuality(r.quality),
        topic: r.topicName ?? r.topicSlug ?? "No topic",
        domain: r.domain ?? batch.domain,
        verdict: (v?.verdict ?? null) as Verdict | null,
        note: v?.note ?? null,
      },
    ];
  });

  return { batch: { ...batch, label: batch.label || batch.domain, status: batch.status as BatchStatus }, sample };
}

export type ReviewCard = NonNullable<Awaited<ReturnType<typeof batchForReview>>>["sample"][number];

const WAITING = and(eq(cards.hidden, true), ne(cards.status, "retired"));

export async function flaggedCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cards)
    .where(WAITING);
  return row?.n ?? 0;
}

/** Hidden cards still waiting for a decision, most recently flagged first. */
export async function flaggedCards() {
  const hidden = await db
    .select({
      id: cards.id,
      promptMd: cards.promptMd,
      answerMd: cards.answerMd,
      format: cards.format,
      flagCount: cards.flagCount,
      topicSlug: cards.topicSlug,
      topicName: topics.name,
      domain: topics.domain,
    })
    .from(cards)
    .leftJoin(topics, eq(topics.slug, cards.topicSlug))
    .where(WAITING);
  if (hidden.length === 0) return [];

  const flags = await db
    .select({ cardId: cardFlags.cardId, reason: cardFlags.reason, createdAt: cardFlags.createdAt, name: profiles.name })
    .from(cardFlags)
    .leftJoin(profiles, eq(profiles.userId, cardFlags.userId))
    .where(
      inArray(
        cardFlags.cardId,
        hidden.map((c) => c.id),
      ),
    )
    .orderBy(desc(cardFlags.createdAt));

  const list = hidden.map((c) => {
    const reasons = flags.filter((f) => f.cardId === c.id).map((f) => ({ reason: f.reason, by: f.name || "Someone", at: f.createdAt }));
    return {
      id: c.id,
      promptMd: c.promptMd,
      answerMd: c.answerMd,
      format: c.format,
      flagCount: c.flagCount,
      topic: c.topicName ?? c.topicSlug ?? "No topic",
      domain: c.domain,
      reasons,
      lastFlaggedAt: reasons[0]?.at ?? null,
    };
  });
  // ISO timestamps sort as strings; cards hidden without any flag go last.
  return list.toSorted((a, b) => (b.lastFlaggedAt ?? "").localeCompare(a.lastFlaggedAt ?? ""));
}

/** Cards ranked by how readers rated them, worst average first: the average, how many readers
 *  rated, and how many gave each star (`stars[0]` is one star, `stars[4]` five).
 *  A card nobody rated is absent. */
export async function ratedCards(limit = 50) {
  const rows = await db
    .select({
      id: cards.id,
      promptMd: cards.promptMd,
      topicSlug: cards.topicSlug,
      topicName: topics.name,
      domain: topics.domain,
      n: sql<number>`count(*)::int`,
      avg: sql<number>`round(avg(${cardRatings.stars})::numeric, 1)::float`,
      s1: sql<number>`count(*) filter (where ${cardRatings.stars} = 1)::int`,
      s2: sql<number>`count(*) filter (where ${cardRatings.stars} = 2)::int`,
      s3: sql<number>`count(*) filter (where ${cardRatings.stars} = 3)::int`,
      s4: sql<number>`count(*) filter (where ${cardRatings.stars} = 4)::int`,
      s5: sql<number>`count(*) filter (where ${cardRatings.stars} = 5)::int`,
    })
    .from(cardRatings)
    .innerJoin(cards, eq(cards.id, cardRatings.cardId))
    .leftJoin(topics, eq(topics.slug, cards.topicSlug))
    .groupBy(cards.id, topics.name, topics.domain)
    .orderBy(sql`avg(${cardRatings.stars}) asc`, desc(sql`count(*)`))
    .limit(limit);
  return rows.map(({ s1, s2, s3, s4, s5, ...r }) => ({
    ...r,
    stars: [s1, s2, s3, s4, s5] as const,
    topic: r.topicName ?? r.topicSlug ?? "No topic",
  }));
}

/** Every rating readers have given: how many, on how many cards, and the overall average. */
export async function ratingTotals() {
  const [row] = await db
    .select({
      ratings: sql<number>`count(*)::int`,
      cards: sql<number>`count(distinct ${cardRatings.cardId})::int`,
      avg: sql<number | null>`round(avg(${cardRatings.stars})::numeric, 1)::float`,
    })
    .from(cardRatings);
  return { ratings: row?.ratings ?? 0, cards: row?.cards ?? 0, avg: row?.avg ?? null };
}
