import "server-only";
import { generateText, Output } from "ai";
import { and, desc, eq, ne } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { checkins, problems, solutionReviews, topics } from "@/db/schema";
import { extractMemory, memoryForPrompt } from "./memory";
import { coachModel, trackCoachUsage } from "./model";
import {
  cleanReview,
  lineCount,
  pickNextProblem,
  referenceSolution,
  type Review,
  type ReviewInput,
  ReviewSchema,
  reviewPrompt,
  reviewSummary,
} from "./review-rules";

// Solution review. Every query is scoped to the userId the caller
// passes, always the signed-in viewer: reviews and check-ins are owner-only.

const CANDIDATES_MAX = 12;

async function problemWithPattern(slug: string) {
  const [row] = await db
    .select({
      slug: problems.slug,
      title: problems.title,
      difficulty: problems.difficulty,
      statementMd: problems.statementMd,
      solutions: problems.solutions,
      patternSlug: problems.patternSlug,
      patternName: topics.name,
    })
    .from(problems)
    .leftJoin(topics, eq(topics.slug, problems.patternSlug))
    .where(eq(problems.slug, slug));
  return row ?? null;
}

/** The viewer's check-in, only if it's theirs and for this problem. */
async function ownCheckin(userId: string, checkinId: string | null, slug: string) {
  if (!checkinId) return null;
  const [row] = await db
    .select({
      id: checkins.id,
      result: checkins.result,
      minutes: checkins.minutes,
      source: checkins.source,
      externalId: checkins.externalId,
    })
    .from(checkins)
    .where(and(eq(checkins.id, checkinId), eq(checkins.userId, userId), eq(checkins.problemSlug, slug)));
  return row ?? null;
}

async function solvedSlugs(userId: string) {
  const rows = await db
    .selectDistinct({ slug: checkins.problemSlug })
    .from(checkins)
    .where(and(eq(checkins.userId, userId), eq(checkins.result, "solved")));
  return new Set(rows.map((r) => r.slug));
}

async function samePattern(patternSlug: string | null, current: string) {
  if (!patternSlug) return [];
  return db
    .select({
      slug: problems.slug,
      title: problems.title,
      difficulty: problems.difficulty,
      importance: problems.importance,
      premium: problems.premium,
    })
    .from(problems)
    .where(and(eq(problems.patternSlug, patternSlug), eq(problems.kind, "leetcode"), ne(problems.slug, current)))
    .orderBy(desc(problems.importance));
}

async function generate(userId: string, input: ReviewInput): Promise<Review | null> {
  const { system, prompt } = reviewPrompt(input);
  const { model } = await coachModel();
  // Invalid structured output gets one retry, then a friendly error.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await generateText({ model, system, prompt, output: Output.object({ schema: ReviewSchema }) });
      await trackCoachUsage(userId, "coach.review", model, result);
      return result.output;
    } catch (e) {
      console.error(`solution review attempt ${attempt + 1} failed`, e);
    }
  }
  return null;
}

export type ReviewRequest = { slug: string; language: string; code: string; checkinId: string | null; hasPremium: boolean };

export async function createSolutionReview(userId: string, req: ReviewRequest): Promise<{ id: string } | { error: string }> {
  const problem = await problemWithPattern(req.slug);
  if (!problem) return { error: "That problem isn't in the library." };
  const [checkin, memory, solved, pattern] = await Promise.all([
    ownCheckin(userId, req.checkinId, req.slug),
    memoryForPrompt(userId),
    solvedSlugs(userId),
    samePattern(problem.patternSlug, problem.slug),
  ]);
  const candidates = pattern.filter((p) => !solved.has(p.slug) && (req.hasPremium || !p.premium)).slice(0, CANDIDATES_MAX);

  const raw = await generate(userId, {
    problem,
    language: req.language,
    code: req.code,
    reference: referenceSolution((problem.solutions ?? {}) as Record<string, string>, req.language),
    checkin,
    memory,
    candidates,
  });
  if (!raw) return { error: "Coach couldn't review this right now. Try again in a minute." };
  const review = cleanReview(raw, lineCount(req.code));

  const suggestedSlug = review.nextProblemSlug;
  const [suggested] = suggestedSlug
    ? await db.select({ slug: problems.slug, premium: problems.premium }).from(problems).where(eq(problems.slug, suggestedSlug))
    : [];
  const nextProblemSlug = pickNextProblem({
    suggested: suggested ?? null,
    current: problem.slug,
    samePattern: pattern,
    solved,
    hasPremium: req.hasPremium,
  });

  const [saved] = await db
    .insert(solutionReviews)
    .values({
      userId,
      problemSlug: problem.slug,
      checkinId: checkin?.id ?? null,
      language: req.language,
      code: req.code,
      correct: review.correct,
      complexity: review.complexity,
      review: { betterApproach: review.betterApproach, lineNotes: review.lineNotes },
      patternLesson: review.patternLesson,
      nextProblemSlug,
    })
    .returning({ id: solutionReviews.id });
  if (!saved) return { error: "Couldn't save the review. Try again." };

  // Memory is a bonus: after the response, and extractMemory never throws.
  const summary = reviewSummary(problem.title, req.language, { ...review, nextProblemSlug });
  after(() => extractMemory(userId, { kind: "review", id: saved.id }, `${summary}\n\nTheir code:\n${req.code}`));
  return { id: saved.id };
}

/** What the review form needs: the problem, and the viewer's check-in when the link carried one. */
export async function reviewFormData(userId: string, slug: string, checkinId: string | null) {
  const [problem] = await db.select({ slug: problems.slug, title: problems.title }).from(problems).where(eq(problems.slug, slug));
  if (!problem) return null;
  return { problem, checkin: await ownCheckin(userId, checkinId, slug) };
}

/** One of the viewer's reviews with its problem and next problem; null if it isn't theirs. */
export async function getSolutionReview(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(solutionReviews)
    .where(and(eq(solutionReviews.id, id), eq(solutionReviews.userId, userId)));
  if (!row) return null;
  const [problem, next] = await Promise.all([
    problemWithPattern(row.problemSlug),
    row.nextProblemSlug
      ? db
          .select({ slug: problems.slug, title: problems.title, difficulty: problems.difficulty })
          .from(problems)
          .where(eq(problems.slug, row.nextProblemSlug))
      : Promise.resolve([]),
  ]);
  if (!problem) return null;
  const stored = row.review as Partial<Pick<Review, "betterApproach" | "lineNotes">>;
  const review: Review = {
    correct: row.correct ?? false,
    complexity: row.complexity as Review["complexity"],
    betterApproach: stored.betterApproach ?? "",
    lineNotes: stored.lineNotes ?? [],
    patternLesson: row.patternLesson ?? "",
    nextProblemSlug: row.nextProblemSlug,
  };
  return {
    id: row.id,
    createdAt: row.createdAt,
    language: row.language,
    code: row.code,
    review,
    problem: { slug: problem.slug, title: problem.title, difficulty: problem.difficulty, statementMd: problem.statementMd },
    pattern: problem.patternSlug ? { slug: problem.patternSlug, name: problem.patternName ?? problem.patternSlug } : null,
    next: next[0] ?? null,
  };
}
