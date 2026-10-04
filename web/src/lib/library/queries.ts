import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  checkinNotes,
  checkins,
  lessons,
  patternTricks,
  problems,
  profiles,
  topicLinks,
  topicOpens,
  topicProgress,
  topics,
} from "@/db/schema";
import { otherFriendIds } from "@/lib/friends/service";
import { type Mastery, masteryState } from "./map-layout";
import type { TopicInput } from "./topic-list";

/** Library areas and how their tab shows up. */
export const AREAS = [
  { key: "dsa", label: "DSA" },
  { key: "system_design", label: "Design" },
  { key: "cs", label: "CS" },
  { key: "java", label: "Java" },
  { key: "sql", label: "SQL" },
  { key: "lld", label: "LLD" },
  { key: "ai", label: "AI" },
  { key: "behavioral", label: "Behavioural" },
  { key: "competitive", label: "Competitive" },
] as const;
export type AreaKey = (typeof AREAS)[number]["key"];

// ILIKE pattern that matches `q` literally: %, _ and \ in a search are text, not wildcards.
const contains = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

// A problem the Library lists: one with a statement, or a premium one (linked out). Parenthesised
// because drizzle's and() joins raw SQL as is, and a bare OR there let every problem with a
// statement into every pattern's list.
const listable = sql`(${problems.statementMd} is not null or ${problems.premium})`;

// Problems that count toward a pattern's mastery on the map.
const IMPORTANT = 0.3;

export type PatternNode = { slug: string; name: string; total: number; solved: number; failed: number; state: Mastery };

export async function patternMap(userId: string, q: Pick<typeof db, "select"> = db) {
  const [nodes, links, counts, mine] = await Promise.all([
    q.select({ slug: topics.slug, name: topics.name }).from(topics).where(eq(topics.domain, "dsa")).orderBy(asc(topics.sort)),
    q.select({ from: topicLinks.fromSlug, to: topicLinks.toSlug }).from(topicLinks),
    q
      .select({ pattern: problems.patternSlug, total: sql<number>`count(*)::int` })
      .from(problems)
      .where(and(eq(problems.kind, "leetcode"), sql`${problems.importance} >= ${IMPORTANT}`))
      .groupBy(problems.patternSlug),
    q
      .select({
        pattern: problems.patternSlug,
        solved: sql<number>`count(distinct ${checkins.problemSlug}) filter (where ${checkins.result} = 'solved')::int`,
        failed: sql<number>`count(distinct ${checkins.problemSlug}) filter (where ${checkins.result} = 'failed')::int`,
      })
      .from(checkins)
      .innerJoin(problems, eq(problems.slug, checkins.problemSlug))
      .where(eq(checkins.userId, userId))
      .groupBy(problems.patternSlug),
  ]);
  const total = new Map(counts.map((c) => [c.pattern, c.total]));
  const progress = new Map(mine.map((m) => [m.pattern, m]));
  const patterns: PatternNode[] = nodes.map((n) => {
    const p = progress.get(n.slug);
    const s = { total: total.get(n.slug) ?? 0, solved: p?.solved ?? 0, failed: p?.failed ?? 0 };
    return { ...n, ...s, state: masteryState(s) };
  });
  const slugs = new Set(nodes.map((n) => n.slug));
  return { patterns, links: links.filter((l) => slugs.has(l.from) && slugs.has(l.to)) };
}

export type ProblemRow = {
  slug: string;
  title: string;
  difficulty: string;
  lcNumber: number | null;
  nc150: boolean;
  premium: boolean;
  companies: number;
  techniques: string[];
  status: "solved" | "hints" | "failed" | null;
};

/** Each problem's most recent check-in by this user: what its status icon shows. */
const latestCheckins = (userId: string) =>
  db
    .selectDistinctOn([checkins.problemSlug], { slug: checkins.problemSlug, result: checkins.result })
    .from(checkins)
    .where(eq(checkins.userId, userId))
    .orderBy(checkins.problemSlug, desc(checkins.createdAt))
    .as("latest");

export async function problemList(
  userId: string,
  opts: { kind: "leetcode" | "competitive"; pattern?: string; q?: string; limit?: number },
) {
  const latest = latestCheckins(userId);
  const filters = [eq(problems.kind, opts.kind), listable];
  if (opts.pattern) filters.push(eq(problems.patternSlug, opts.pattern));
  if (opts.q) filters.push(ilike(problems.title, contains(opts.q)));
  if (opts.kind === "leetcode") filters.push(sql`cardinality(${problems.topicSlugs}) = 0`);
  const rows = await db
    .select({
      slug: problems.slug,
      title: problems.title,
      difficulty: problems.difficulty,
      lcNumber: problems.lcNumber,
      nc150: problems.nc150,
      premium: problems.premium,
      companies: sql<number>`(select count(*) from jsonb_object_keys(${problems.companies}))::int`,
      techniques: problems.techniques,
      status: latest.result,
    })
    .from(problems)
    .leftJoin(latest, eq(latest.slug, problems.slug))
    .where(and(...filters))
    .orderBy(desc(problems.importance), asc(problems.lcNumber))
    .limit(opts.limit ?? 60);
  return rows as ProblemRow[];
}

/** How many problems of one kind the Library lists (the count on its tab), and how many of them the viewer has solved. */
export async function problemTally(userId: string, kind: "leetcode" | "competitive") {
  // Solved means the latest check-in says so, the same rule as the status icon in the list.
  const latest = latestCheckins(userId);
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      solved: sql<number>`(count(*) filter (where ${latest.result} = 'solved'))::int`,
    })
    .from(problems)
    .leftJoin(latest, eq(latest.slug, problems.slug))
    .where(and(eq(problems.kind, kind), listable));
  return { total: row?.total ?? 0, solved: row?.solved ?? 0 };
}

export async function problemDetail(slug: string, userId: string) {
  const [problem] = await db.select().from(problems).where(eq(problems.slug, slug));
  if (!problem) return null;
  const [pattern] = problem.patternSlug
    ? await db.select({ slug: topics.slug, name: topics.name }).from(topics).where(eq(topics.slug, problem.patternSlug))
    : [];
  const otherIds = await otherFriendIds(userId);
  const [mine, friends, tricks] = await Promise.all([
    db
      .select({
        id: checkins.id,
        result: checkins.result,
        minutes: checkins.minutes,
        createdAt: checkins.createdAt,
        note: checkinNotes.note,
      })
      .from(checkins)
      .leftJoin(checkinNotes, eq(checkinNotes.checkinId, checkins.id))
      .where(and(eq(checkins.problemSlug, slug), eq(checkins.userId, userId)))
      .orderBy(desc(checkins.createdAt))
      .limit(5),
    otherIds.length
      ? db
          // First name only: the query decides, not the component.
          .select({
            name: sql<string>`split_part(${profiles.name}, ' ', 1)`,
            result: checkins.result,
            minutes: checkins.minutes,
            createdAt: checkins.createdAt,
          })
          .from(checkins)
          .innerJoin(profiles, eq(profiles.userId, checkins.userId))
          .where(and(eq(checkins.problemSlug, slug), inArray(checkins.userId, otherIds)))
          .orderBy(desc(checkins.createdAt))
          .limit(5)
      : Promise.resolve([]),
    problem.patternSlug
      ? db
          .select({ name: patternTricks.name, idea: patternTricks.ideaMd })
          .from(patternTricks)
          .where(sql`${patternTricks.patternSlug} = ${problem.patternSlug} and ${slug} = any(${patternTricks.problemSlugs})`)
      : Promise.resolve([]),
  ]);
  return { problem, pattern: pattern ?? null, mine, friends, tricks };
}

/** An area's topics in reading order, each with where this reader is on it. */
export async function areaTopics(domain: string, userId: string): Promise<TopicInput[]> {
  const rows = await db
    .select({
      slug: topics.slug,
      name: topics.name,
      // The lesson's own one-line summary, as the design shows; the topic's catalogue line if none.
      description: sql<string | null>`coalesce(${lessons.summary}, ${topics.description})`,
      parent: topics.parentSlug,
      section: topics.section,
      done: sql<boolean>`${topicProgress.topicSlug} is not null`,
      opened: sql<boolean>`${topicOpens.topicSlug} is not null`,
    })
    .from(topics)
    // Inner join: a topic whose lesson is not published has no page, so
    // listing it would link to a 404.
    .innerJoin(lessons, eq(lessons.topicSlug, topics.slug))
    .leftJoin(topicProgress, and(eq(topicProgress.topicSlug, topics.slug), eq(topicProgress.userId, userId)))
    .leftJoin(topicOpens, and(eq(topicOpens.topicSlug, topics.slug), eq(topicOpens.userId, userId)))
    .where(eq(topics.domain, domain))
    .orderBy(asc(topics.sort), asc(topics.slug));
  return rows.map(({ done, opened, ...t }) => ({ ...t, state: done ? "done" : opened ? "opened" : "not_started" }));
}

/** Topics in a non-problem area whose name or lesson summary matches. */
export async function searchArea(domain: string, q: string, limit = 40) {
  const hits = await db
    .select({
      slug: topics.slug,
      name: topics.name,
      summary: lessons.summary,
      words: lessons.words,
    })
    .from(topics)
    .innerJoin(lessons, eq(lessons.topicSlug, topics.slug))
    .where(and(eq(topics.domain, domain), or(ilike(topics.name, contains(q)), ilike(lessons.summary, contains(q)))))
    .orderBy(asc(topics.sort))
    .limit(limit);
  return { topics: hits };
}

export async function topicDetail(slug: string) {
  const [topic] = await db.select().from(topics).where(eq(topics.slug, slug));
  if (!topic) return null;
  const [lesson] = await db.select().from(lessons).where(eq(lessons.topicSlug, slug));
  // A DSA topic is a pattern, and its tricks are the shape you reach for
  // before touching any single problem.
  const tricks =
    topic.domain === "dsa"
      ? await db
          .select({ id: patternTricks.id, name: patternTricks.name, idea: patternTricks.ideaMd })
          .from(patternTricks)
          .where(eq(patternTricks.patternSlug, slug))
          .orderBy(asc(patternTricks.sort))
      : [];
  return { topic, lesson: lesson ?? null, tricks };
}

export type LessonSource = { id: string; name: string; url: string | null };

/** The books and repos a lesson was written from, for its Sources line. */
export function sourcesOf(lesson: { sourceRefs: unknown }): LessonSource[] {
  const refs = lesson.sourceRefs;
  if (!Array.isArray(refs)) return [];
  return refs.flatMap((r) => {
    const { id, name, url } = (r ?? {}) as Record<string, unknown>;
    if (typeof id !== "string" || !id) return [];
    return [{ id, name: typeof name === "string" && name ? name : id, url: typeof url === "string" ? url : null }];
  });
}

export type Practice = {
  problems: { slug: string; title: string; difficulty: string; companies: string[] }[];
  questions: { slug: string; title: string; difficulty: string | null; url: string }[];
};

/** What a lesson unlocks: our own problems, and real interview questions. */
export async function practiceFor(lesson: { practice: unknown }): Promise<Practice> {
  const raw = (lesson.practice ?? {}) as { problems?: string[]; questions?: Practice["questions"] };
  const slugs = raw.problems ?? [];
  const rows = slugs.length
    ? await db
        .select({
          slug: problems.slug,
          title: problems.title,
          difficulty: problems.difficulty,
          companies: problems.companies,
        })
        .from(problems)
        .where(inArray(problems.slug, slugs))
    : [];
  // Keep the catalog's order: most important first, NeetCode 150 and Blind 75 ahead of the rest.
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return {
    problems: slugs.flatMap((s) => {
      const row = bySlug.get(s);
      if (!row) return [];
      const freq = (row.companies ?? {}) as Record<string, number>;
      const companies = Object.entries(freq)
        .filter(([, f]) => f >= 60)
        .toSorted((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name]) => name);
      return [{ slug: row.slug, title: row.title, difficulty: row.difficulty, companies }];
    }),
    questions: raw.questions ?? [],
  };
}
