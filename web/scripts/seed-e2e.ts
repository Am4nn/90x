// Seeds the small, fixed dataset the Playwright suite runs on, into the local
// database (CI's throwaway Supabase). Safe to run again: every row has a fixed
// key and existing rows are left alone.
//
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres bun run scripts/seed-e2e.ts

import { db } from "@/db";
import { cardBatches, cards, lessons, patternTricks, problems, roadmapNodes, sources, topicLinks, topics } from "@/db/schema";
import {
  LESSON,
  DRAFT_BATCH,
  DRAFT_CARDS,
  LIVE_BATCH,
  LIVE_CARDS,
  PROBLEMS,
  ROADMAP_NODES,
  type SeedCard,
  SOURCE,
  solutionOf,
  statementOf,
  TOPIC_LINKS,
  TOPICS,
  TRICKS,
} from "../e2e/seed-data";

const url = process.env.DATABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost):54322\//.test(url)) {
  console.error("seed-e2e only writes to the local Supabase database (port 54322). Refusing:", url.replace(/:[^:@/]*@/, ":***@"));
  process.exit(1);
}

const cardRow = (card: SeedCard, batchId: string, status: "live" | "draft") => ({
  id: card.id,
  batchId,
  topicSlug: card.topicSlug,
  format: card.format,
  difficulty: card.difficulty,
  promptMd: card.promptMd,
  answerMd: card.answerMd,
  keyPoints: card.keyPoints,
  options: card.options ?? null,
  sourceRefs: [{ kind: "lesson", id: LESSON.topicSlug, title: LESSON.title }],
  status,
  risk: 0.9,
});

await db.transaction(async (tx) => {
  await tx.insert(sources).values(SOURCE).onConflictDoNothing();
  await tx.insert(topics).values(TOPICS).onConflictDoNothing();
  await tx.insert(topicLinks).values(TOPIC_LINKS).onConflictDoNothing();
  await tx
    .insert(problems)
    .values(
      PROBLEMS.map((p) => ({
        ...p,
        kind: "leetcode",
        topicSlugs: [],
        statementMd: statementOf(p),
        solutions: { python: solutionOf(p) },
        sourceId: SOURCE.id,
      })),
    )
    .onConflictDoNothing();
  await tx.insert(lessons).values(LESSON).onConflictDoNothing();
  await tx.insert(roadmapNodes).values(ROADMAP_NODES).onConflictDoNothing();
  await tx
    .insert(cardBatches)
    .values([
      { ...LIVE_BATCH, topicSlugs: [...new Set(LIVE_CARDS.map((c) => c.topicSlug))], aiPassRate: 1 },
      { ...DRAFT_BATCH, topicSlugs: [...new Set(DRAFT_CARDS.map((c) => c.topicSlug))], aiPassRate: 0.9 },
    ])
    .onConflictDoNothing();
  await tx
    .insert(cards)
    .values([...LIVE_CARDS.map((c) => cardRow(c, LIVE_BATCH.id, "live")), ...DRAFT_CARDS.map((c) => cardRow(c, DRAFT_BATCH.id, "draft"))])
    .onConflictDoNothing();
  await tx.insert(patternTricks).values(TRICKS).onConflictDoNothing();
});

console.log(
  `Seeded ${PROBLEMS.length} problems, ${TOPICS.length} topics, ${LIVE_CARDS.length} live and ${DRAFT_CARDS.length} draft cards.`,
);
process.exit(0);
