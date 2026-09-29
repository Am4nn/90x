// Seeds the small, fixed dataset the Playwright suite runs on, into the local
// database (CI's throwaway Supabase). Safe to run again: every row has a fixed
// key and existing rows are left alone.
//
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres bun run scripts/seed-e2e.ts

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  cardBatches,
  cards,
  lessons,
  patternTricks,
  problems,
  roadmapNodes,
  sources,
  topicLinks,
  topics,
  usersInAuth,
  weeklyReviews,
} from "@/db/schema";
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
  WEEKLY_USERS,
} from "../e2e/seed-data";

const url = process.env.DATABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost):54322\//.test(url)) {
  console.error("seed-e2e only writes to the local Supabase database (port 54322). Refusing:", url.replace(/:[^:@/]*@/, ":***@"));
  process.exit(1);
}

// The suite's shared password, matching src/app/api/test/sign-in/route.ts. Not a
// secret: the route only answers against a throwaway local Supabase.
const E2E_PASSWORD = "e2e-local-only-password";

/**
 * Creates the weekly-review users and returns their ids by email. A weekly review
 * hangs off an auth user and has no UI path that creates one, so the seed owns the
 * users too. The spec then signs in through the same test route as everyone else:
 * its prepare() step approves the user and starts a campaign, and the route's
 * createUser call returns email_exists for a user seeded here.
 */
async function weeklyUserIds(): Promise<Map<string, string>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!/^https?:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(supabaseUrl) || !serviceKey) {
    throw new Error("seed-e2e needs the local Supabase URL and service role key to create the weekly-review users");
  }
  const admin = createAdminClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const ids = new Map<string, string>();
  for (const { email } of WEEKLY_USERS) {
    const created = await admin.auth.admin.createUser({ email, password: E2E_PASSWORD, email_confirm: true });
    if (!created.error) {
      ids.set(email, created.data.user.id);
      continue;
    }
    if (created.error.code !== "email_exists") throw new Error(`createUser ${email} failed: ${created.error.message}`);
    const [row] = await db.select({ id: usersInAuth.id }).from(usersInAuth).where(eq(usersInAuth.email, email));
    if (!row) throw new Error(`seed-e2e: ${email} is in auth but could not be read back`);
    ids.set(email, row.id);
  }
  return ids;
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

const weeklyIds = await weeklyUserIds();

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
  await tx
    .insert(weeklyReviews)
    .values(
      WEEKLY_USERS.flatMap((user) => {
        const userId = weeklyIds.get(user.email);
        if (!userId) throw new Error(`seed-e2e: no user id for ${user.email}`);
        return user.reviews.map((review) => ({ ...review, userId }));
      }),
    )
    .onConflictDoNothing();
});

console.log(
  `Seeded ${PROBLEMS.length} problems, ${TOPICS.length} topics, ${LIVE_CARDS.length} live and ${DRAFT_CARDS.length} draft cards, ` +
    `${WEEKLY_USERS.reduce((n, u) => n + u.reviews.length, 0)} weekly reviews for ${WEEKLY_USERS.length} users.`,
);
process.exit(0);
