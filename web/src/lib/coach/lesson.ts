import "server-only";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { cards, checkins, patternTricks, problems, profiles, topics } from "@/db/schema";
import { localDate } from "@/lib/tracker/dates";
import { ladder, type LessonMaterial, type LessonProblem, pickTrickSnippet, workedExample } from "./lesson-rules";

// Loads a pattern lesson's material from our own data. Content
// tables are shared; the only per-user reads (solved problems, profile) are
// scoped to the userId the caller passes.

const LESSON_CARDS_MAX = 10;

async function patternProblems(patternSlug: string): Promise<LessonProblem[]> {
  const rows = await db
    .select({
      slug: problems.slug,
      title: problems.title,
      difficulty: problems.difficulty,
      importance: problems.importance,
      premium: problems.premium,
      statementMd: problems.statementMd,
      solutions: problems.solutions,
    })
    .from(problems)
    .where(and(eq(problems.patternSlug, patternSlug), eq(problems.kind, "leetcode")));
  return rows.map((r) => ({ ...r, solutions: (r.solutions ?? {}) as Record<string, string> }));
}

/** The ladder for the viewer: unsolved problems in the pattern, easy to hard. */
export async function lessonLadder(userId: string, patternSlug: string) {
  const [pool, solvedRows, [profile]] = await Promise.all([
    patternProblems(patternSlug),
    db
      .selectDistinct({ slug: checkins.problemSlug })
      .from(checkins)
      .where(and(eq(checkins.userId, userId), eq(checkins.result, "solved"))),
    db.select({ hasPremium: profiles.hasLeetcodePremium, timezone: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId)),
  ]);
  const example = workedExample(pool);
  const rungs = ladder(pool, {
    solved: new Set(solvedRows.map((r) => r.slug)),
    exclude: new Set(example ? [example.slug] : []),
    hasPremium: profile?.hasPremium ?? false,
  });
  return { pool, example, rungs, timezone: profile?.timezone ?? "UTC" };
}

export async function lessonMaterial(
  userId: string,
  patternSlug: string,
  language: string | null,
  memory: string,
  now: Date,
): Promise<LessonMaterial | null> {
  const [pattern] = await db
    .select({ slug: topics.slug, name: topics.name, description: topics.description })
    .from(topics)
    .where(and(eq(topics.slug, patternSlug), eq(topics.domain, "dsa")));
  if (!pattern) return null;
  const [tricks, { example, rungs, timezone }] = await Promise.all([
    db.select().from(patternTricks).where(eq(patternTricks.patternSlug, patternSlug)).orderBy(asc(patternTricks.sort)),
    lessonLadder(userId, patternSlug),
  ]);
  // Tricks may link problems from other patterns; only real ones are named.
  const linked = [...new Set(tricks.flatMap((t) => t.problemSlugs.filter(Boolean)))];
  const titles = linked.length
    ? await db.select({ slug: problems.slug, title: problems.title }).from(problems).where(inArray(problems.slug, linked))
    : [];
  const titleOf = new Map(titles.map((t) => [t.slug, t.title]));
  const solution = example ? pickTrickSnippet(example.solutions, language) : null;

  return {
    pattern,
    tricks: tricks.map((t) => ({
      name: t.name,
      idea: t.ideaMd,
      snippet: pickTrickSnippet((t.snippets ?? {}) as Record<string, string>, language),
      problems: t.problemSlugs.flatMap((slug) => {
        const title = titleOf.get(slug);
        return title ? [{ slug, title }] : [];
      }),
    })),
    example: example && solution ? { ...example, solution } : null,
    ladder: rungs,
    language,
    memory,
    today: localDate(timezone, now),
  };
}

/** Live cards on the pattern or its problems, for the feed suggestion at the end of a lesson. */
export async function patternCardIds(patternSlug: string): Promise<string[]> {
  const rows = await db
    .select({ id: cards.id })
    .from(cards)
    .leftJoin(problems, eq(problems.slug, cards.problemSlug))
    .where(
      and(eq(cards.status, "live"), eq(cards.hidden, false), or(eq(cards.topicSlug, patternSlug), eq(problems.patternSlug, patternSlug))),
    )
    .limit(LESSON_CARDS_MAX);
  return rows.map((r) => r.id);
}
