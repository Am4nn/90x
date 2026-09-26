import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { checkinNotes, checkins, documents, patternTricks, problems, profiles, topicLinks, topics } from "@/db/schema";
import { type Mastery, masteryState } from "./map-layout";

/** Library areas and how their tab shows up. */
export const AREAS = [
  { key: "dsa", label: "DSA" },
  { key: "system_design", label: "Design" },
  { key: "cs", label: "CS" },
  { key: "java", label: "Java" },
  { key: "sql", label: "SQL" },
  { key: "lld", label: "LLD" },
  { key: "ai", label: "AI" },
  { key: "behavioral", label: "Behavioral" },
  { key: "competitive", label: "Competitive" },
] as const;
export type AreaKey = (typeof AREAS)[number]["key"];

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

export async function problemList(userId: string, opts: { kind: "leetcode" | "competitive"; pattern?: string; q?: string; limit?: number }) {
  const latest = db
    .selectDistinctOn([checkins.problemSlug], { slug: checkins.problemSlug, result: checkins.result })
    .from(checkins)
    .where(eq(checkins.userId, userId))
    .orderBy(checkins.problemSlug, desc(checkins.createdAt))
    .as("latest");
  const filters = [eq(problems.kind, opts.kind), sql`${problems.statementMd} is not null or ${problems.premium}`];
  if (opts.pattern) filters.push(eq(problems.patternSlug, opts.pattern));
  if (opts.q) filters.push(ilike(problems.title, `%${opts.q}%`));
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

export async function problemDetail(slug: string, userId: string) {
  const [problem] = await db.select().from(problems).where(eq(problems.slug, slug));
  if (!problem) return null;
  const [pattern] = problem.patternSlug
    ? await db.select({ slug: topics.slug, name: topics.name }).from(topics).where(eq(topics.slug, problem.patternSlug))
    : [];
  const [mine, friends, tricks] = await Promise.all([
    db
      .select({ id: checkins.id, result: checkins.result, minutes: checkins.minutes, createdAt: checkins.createdAt, note: checkinNotes.note })
      .from(checkins)
      .leftJoin(checkinNotes, eq(checkinNotes.checkinId, checkins.id))
      .where(and(eq(checkins.problemSlug, slug), eq(checkins.userId, userId)))
      .orderBy(desc(checkins.createdAt))
      .limit(5),
    db
      .select({ name: profiles.name, result: checkins.result, minutes: checkins.minutes, createdAt: checkins.createdAt })
      .from(checkins)
      .innerJoin(profiles, eq(profiles.userId, checkins.userId))
      .where(and(eq(checkins.problemSlug, slug), ne(checkins.userId, userId)))
      .orderBy(desc(checkins.createdAt))
      .limit(5),
    problem.patternSlug
      ? db.select({ name: patternTricks.name, idea: patternTricks.ideaMd }).from(patternTricks)
          .where(sql`${patternTricks.patternSlug} = ${problem.patternSlug} and ${slug} = any(${patternTricks.problemSlugs})`)
      : Promise.resolve([]),
  ]);
  return { problem, pattern: pattern ?? null, mine, friends, tricks };
}

export async function areaTopics(domain: string) {
  return db
    .select({
      slug: topics.slug,
      name: topics.name,
      description: topics.description,
      parent: topics.parentSlug,
      importance: topics.importance,
      docs: sql<number>`(select count(*) from ${documents} d where d.topic_slug = ${topics.slug})::int`,
    })
    .from(topics)
    .where(eq(topics.domain, domain))
    .orderBy(asc(topics.sort));
}

export async function unfiledCount(domain: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(documents)
    .where(and(eq(documents.domain, domain), isNull(documents.topicSlug)));
  return row?.n ?? 0;
}

export async function topicDetail(slug: string) {
  const [topic] = await db.select().from(topics).where(eq(topics.slug, slug));
  if (!topic) return null;
  const docs = await db
    .select({ id: documents.id, title: documents.title, url: documents.url, sourceId: documents.sourceId, length: sql<number>`length(${documents.bodyMd})::int` })
    .from(documents)
    .where(eq(documents.topicSlug, slug))
    .orderBy(asc(documents.sourceId), asc(documents.sort));
  return { topic, docs };
}

export async function documentDetail(id: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) return null;
  const [topic] = doc.topicSlug ? await db.select({ slug: topics.slug, name: topics.name }).from(topics).where(eq(topics.slug, doc.topicSlug)) : [];
  return { doc, topic: topic ?? null };
}

export async function problemsBySlugs(slugs: string[]) {
  if (!slugs.length) return [];
  return db.select({ slug: problems.slug, title: problems.title }).from(problems).where(inArray(problems.slug, slugs));
}
