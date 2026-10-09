import "server-only";
import { and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, cardReviews, cards, checkins, days, mocks, problems, readinessSnapshots, topics } from "@/db/schema";
import { DAY_MS, WEAK_WINDOW_DAYS } from "@/lib/feed/grade";
import { cardProblemListed, listedProblem } from "@/lib/library/listed";
import { patternMap } from "@/lib/library/queries";
import { addDays, daysBetween, localDate } from "@/lib/tracker/dates";
import { streak } from "@/lib/tracker/days";
import { scoreboard } from "@/lib/tracker/me";
import { ensureToday, snapshotReadiness, timezoneOf, unstudiedTopics, type Db } from "@/lib/tracker/service";
import type { Templates } from "@/lib/tracker/template";

// What the coach's read tools look up. Every function takes the signed-in
// user's id and reads only that user's private rows; the one exception,
// friendSummaryData, reads other users' public stats and
// nothing else. The connection bypasses RLS, so the scoping here is the guard.
// Each takes `q` so scripts/check-coach-tools.ts can run them in a rolled-back
// transaction.

const ACTIVITY_DAYS = 14;
const MAX_ROWS = 10;

const since = (now: Date, daysBack: number) => new Date(now.getTime() - daysBack * DAY_MS).toISOString();

export async function progressData(userId: string, q: Db = db, now = new Date()) {
  const today = localDate(await timezoneOf(userId, q), now);
  // Computed now (and saved as today's snapshot) so Coach quotes the number Today and Me show.
  const snapshot = await snapshotReadiness(userId, today, q);
  const [trend, [campaign]] = await Promise.all([
    q
      .select({ date: readinessSnapshots.date, overall: readinessSnapshots.overall })
      .from(readinessSnapshots)
      .where(and(eq(readinessSnapshots.userId, userId), gte(readinessSnapshots.date, addDays(today, -13))))
      .orderBy(readinessSnapshots.date),
    q
      .select({ id: campaigns.id, startDate: campaigns.startDate, lengthDays: campaigns.lengthDays })
      .from(campaigns)
      .where(and(eq(campaigns.userId, userId), eq(campaigns.status, "active"))),
  ]);
  const dayRows = campaign
    ? await q
        .select({ date: days.date, status: days.status })
        .from(days)
        .where(and(eq(days.userId, userId), eq(days.campaignId, campaign.id)))
    : [];
  return {
    snapshot,
    trend,
    streak: streak(dayRows, today),
    campaign: campaign
      ? { day: Math.min(campaign.lengthDays, daysBetween(campaign.startDate, today) + 1), length: campaign.lengthDays }
      : null,
  };
}

export async function weakSpotsData(userId: string, q: Db = db, now = new Date()) {
  const from = since(now, WEAK_WINDOW_DAYS);
  const [map, misses, cardAnswers, mockRows] = await Promise.all([
    patternMap(userId, q),
    q
      .select({ title: problems.title, pattern: problems.patternSlug, result: checkins.result })
      .from(checkins)
      .innerJoin(problems, eq(problems.slug, checkins.problemSlug))
      .where(and(eq(checkins.userId, userId), inArray(checkins.result, ["failed", "hints"]), gte(checkins.createdAt, from)))
      .orderBy(desc(checkins.createdAt))
      .limit(30),
    q
      .select({ topic: topics.slug, name: topics.name, outcome: cardReviews.outcome })
      .from(cardReviews)
      .innerJoin(cards, eq(cards.id, cardReviews.cardId))
      .innerJoin(topics, eq(topics.slug, cards.topicSlug))
      .where(and(eq(cardReviews.userId, userId), gte(cardReviews.createdAt, from)))
      .limit(500),
    q
      .select({ type: mocks.type, topic: mocks.topic, score: mocks.score })
      .from(mocks)
      .where(and(eq(mocks.userId, userId), eq(mocks.status, "done")))
      .orderBy(desc(mocks.startedAt))
      .limit(5),
  ]);
  return { patterns: map.patterns, misses, cardAnswers, mocks: mockRows };
}

export async function recentActivityData(userId: string, q: Db = db, now = new Date()) {
  const from = since(now, ACTIVITY_DAYS);
  const [checkinRows, cardAnswers, mockRows] = await Promise.all([
    // Never joins checkin_notes: notes stay out of prompts unless the user pastes them.
    q
      .select({ title: problems.title, result: checkins.result, minutes: checkins.minutes, createdAt: checkins.createdAt })
      .from(checkins)
      .innerJoin(problems, eq(problems.slug, checkins.problemSlug))
      .where(and(eq(checkins.userId, userId), gte(checkins.createdAt, from)))
      .orderBy(desc(checkins.createdAt))
      .limit(MAX_ROWS),
    q
      .select({ name: topics.name, outcome: cardReviews.outcome })
      .from(cardReviews)
      .innerJoin(cards, eq(cards.id, cardReviews.cardId))
      .innerJoin(topics, eq(topics.slug, cards.topicSlug))
      .where(and(eq(cardReviews.userId, userId), gte(cardReviews.createdAt, from)))
      .limit(300),
    q
      .select({ type: mocks.type, topic: mocks.topic, score: mocks.score, status: mocks.status, startedAt: mocks.startedAt })
      .from(mocks)
      .where(and(eq(mocks.userId, userId), gte(mocks.startedAt, from)))
      .orderBy(desc(mocks.startedAt))
      .limit(5),
  ]);
  return { checkins: checkinRows, cardAnswers, mocks: mockRows };
}

export async function planData(userId: string, q: Db = db, now = new Date()) {
  const view = await ensureToday(userId, now, q);
  if (view.state !== "active") return { today: null, templates: null, companyFocus: null };
  return {
    today: {
      dayNumber: view.dayNumber,
      lengthDays: view.campaign.lengthDays,
      missions: view.missions.map((m) => ({
        title: m.title,
        slotType: m.slotType,
        status: m.status,
        estMinutes: m.estMinutes,
        ref: m.ref,
      })),
    },
    templates: view.campaign.templates as Templates,
    companyFocus: view.campaign.companyFocus,
  };
}

const slugOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** A DSA pattern by slug or name ("sliding window" → sliding-window). */
async function patternSlug(text: string, q: Db): Promise<string | null> {
  const [row] = await q
    .select({ slug: topics.slug })
    .from(topics)
    .where(and(eq(topics.domain, "dsa"), sql`(${topics.slug} = ${slugOf(text)} or lower(${topics.name}) = lower(${text.trim()}))`))
    .limit(1);
  return row?.slug ?? null;
}

async function patternNames(q: Db) {
  const rows = await q.select({ name: topics.name }).from(topics).where(eq(topics.domain, "dsa")).orderBy(asc(topics.sort));
  return rows.map((r) => r.name);
}

export type ProblemFilters = {
  pattern?: string;
  difficulty?: string;
  company?: string;
  status?: "solved" | "unsolved" | "any";
  limit?: number;
};

export async function findProblemsData(userId: string, filters: ProblemFilters, q: Db = db) {
  const latest = q
    .selectDistinctOn([checkins.problemSlug], { slug: checkins.problemSlug, result: checkins.result })
    .from(checkins)
    .where(eq(checkins.userId, userId))
    .orderBy(checkins.problemSlug, desc(checkins.createdAt))
    .as("latest");
  const where = [
    eq(problems.kind, "leetcode"),
    sql`(${problems.statementMd} is not null or ${problems.premium})`,
    sql`cardinality(${problems.topicSlugs}) = 0`,
    // A problem the catalog dropped is not found again, unless it is in this user's history.
    or(listedProblem, sql`${latest.slug} is not null`)!,
  ];
  if (filters.pattern) {
    const slug = await patternSlug(filters.pattern, q);
    if (!slug) return { problems: [], unknownPattern: filters.pattern, patterns: await patternNames(q) };
    where.push(eq(problems.patternSlug, slug));
  }
  if (filters.difficulty) where.push(sql`lower(${problems.difficulty}) = lower(${filters.difficulty})`);
  if (filters.company) {
    where.push(sql`exists (select 1 from jsonb_object_keys(${problems.companies}) k where lower(k) = lower(${filters.company.trim()}))`);
  }
  if (filters.status === "solved") where.push(eq(latest.result, "solved"));
  if (filters.status === "unsolved") where.push(sql`(${latest.result} is null or ${latest.result} <> 'solved')`);
  const rows = await q
    .select({
      slug: problems.slug,
      title: problems.title,
      difficulty: problems.difficulty,
      pattern: problems.patternSlug,
      premium: problems.premium,
      status: latest.result,
    })
    .from(problems)
    .leftJoin(latest, eq(latest.slug, problems.slug))
    .where(and(...where))
    .orderBy(desc(problems.importance), asc(problems.lcNumber))
    .limit(Math.min(filters.limit ?? MAX_ROWS, MAX_ROWS));
  return { problems: rows };
}

/** Study topics outside DSA this user has not studied, best first: what "Add with Coach" can pick from. */
export async function findTopicsData(userId: string, filters: { area?: string; query?: string }, q: Db = db) {
  const needle = filters.query?.trim().toLowerCase();
  const rows = (await unstudiedTopics(userId, q))
    .filter((t) => (!filters.area || t.area === filters.area) && (!needle || t.name.toLowerCase().includes(needle)))
    .toSorted((a, b) => b.importance - a.importance)
    .slice(0, MAX_ROWS);
  return { topics: rows.map((t) => ({ slug: t.slug, name: t.name, area: t.area })) };
}

export type CardFilters = { topic?: string; format?: string; missed?: boolean; limit?: number };

export async function findCardsData(userId: string, filters: CardFilters, q: Db = db) {
  const latest = q
    .selectDistinctOn([cardReviews.cardId], { cardId: cardReviews.cardId, outcome: cardReviews.outcome, at: cardReviews.createdAt })
    .from(cardReviews)
    .where(eq(cardReviews.userId, userId))
    .orderBy(cardReviews.cardId, desc(cardReviews.createdAt))
    .as("latest");
  // A card about a problem the catalog dropped is found only once this user has answered it.
  const where = [eq(cards.status, "live"), eq(cards.hidden, false), or(cardProblemListed, sql`${latest.cardId} is not null`)!];
  if (filters.topic) {
    const text = filters.topic.trim();
    where.push(sql`(${topics.slug} = ${slugOf(text)} or ${topics.name} ilike ${`%${text}%`})`);
  }
  if (filters.format) where.push(eq(cards.format, filters.format));
  if (filters.missed) where.push(sql`${latest.outcome} in ('wrong', 'skipped', 'new_to_me')`);
  const rows = await q
    .select({ id: cards.id, topic: topics.name, format: cards.format, promptMd: cards.promptMd, lastOutcome: latest.outcome })
    .from(cards)
    .innerJoin(topics, eq(topics.slug, cards.topicSlug))
    .leftJoin(latest, eq(latest.cardId, cards.id))
    .where(and(...where))
    .orderBy(filters.missed ? desc(latest.at) : desc(topics.importance), asc(cards.createdAt))
    .limit(Math.min(filters.limit ?? MAX_ROWS, MAX_ROWS));
  return rows;
}

/** Friends' public stats: readiness, streak, solved this week, finished mock scores. Nothing else. */
export async function friendSummaryData(viewerId: string, name: string | undefined, q: Db = db) {
  const wanted = name?.trim().toLowerCase();
  const people = (await scoreboard(viewerId, q)).filter((p) => !p.isMe && (!wanted || p.name.toLowerCase().startsWith(wanted)));
  if (!people.length) return [];
  const mockRows = await q
    .select({ userId: mocks.userId, type: mocks.type, topic: mocks.topic, score: mocks.score })
    .from(mocks)
    .where(
      and(
        inArray(
          mocks.userId,
          people.map((p) => p.userId),
        ),
        eq(mocks.status, "done"),
      ),
    )
    .orderBy(desc(mocks.startedAt))
    .limit(people.length * 3);
  return people.map((p) => ({
    name: p.name,
    readiness: p.readiness,
    streak: p.streak,
    solvedThisWeek: p.solvedThisWeek,
    mocks: mockRows.filter((m) => m.userId === p.userId).slice(0, 3),
  }));
}

const VECTOR_TIMEOUT_MS = 8000;

/** Top passages from the Upstash Vector index (built-in embeddings, `query-data`). */
export async function searchKnowledge(query: string, topK = 5): Promise<unknown[]> {
  const url = process.env.UPSTASH_VECTOR_REST_URL;
  // The app only ever reads the index, so it uses the read-only token when
  // one is set: a leaked server environment then cannot change what the Coach answers from.
  const token = process.env.UPSTASH_VECTOR_REST_READONLY_TOKEN || process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (!url || !token) throw new Error("UPSTASH_VECTOR_REST_URL and a token are not set");
  const res = await fetch(`${url.replace(/\/$/, "")}/query-data`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ data: query, topK, includeMetadata: true, includeData: true }),
    signal: AbortSignal.timeout(VECTOR_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`vector query failed: ${res.status}`);
  const body = (await res.json()) as { result?: unknown };
  return Array.isArray(body.result) ? body.result : [];
}

// Lookups the action tools use to check a proposal before showing it.

/** Live cards among `ids` that the Coach may queue for this user: one about a problem the catalog dropped only if they answered it. */
export async function liveCards(userId: string, ids: string[], q: Db = db) {
  if (!ids.length) return [];
  const answered = sql`exists (select 1 from ${cardReviews} where ${cardReviews.userId} = ${userId} and ${cardReviews.cardId} = ${cards.id})`;
  return q
    .select({ id: cards.id, topic: topics.name })
    .from(cards)
    .innerJoin(topics, eq(topics.slug, cards.topicSlug))
    .where(and(inArray(cards.id, ids), eq(cards.status, "live"), eq(cards.hidden, false), or(cardProblemListed, answered)));
}

/** A problem by slug. `listed` leaves out one the catalog dropped: for a new-problem pick, not a review of one already done. */
export async function problemBySlug(slug: string, q: Db = db, opts: { listed?: boolean } = {}) {
  const [row] = await q
    .select({ slug: problems.slug, title: problems.title })
    .from(problems)
    .where(and(eq(problems.slug, slug), opts.listed ? listedProblem : undefined));
  return row ?? null;
}

/** A study topic by slug or name. DSA is left out unless `anyDomain`: a DSA topic is studied through problems, not as a mission. */
export async function topicBySlugOrName(text: string, q: Db = db, opts: { anyDomain?: boolean } = {}) {
  const domain = opts.anyDomain ? sql`true` : sql`${topics.domain} <> 'dsa'`;
  const [row] = await q
    .select({ slug: topics.slug, name: topics.name })
    .from(topics)
    .where(sql`${domain} and (${topics.slug} = ${slugOf(text)} or lower(${topics.name}) = lower(${text.trim()}))`)
    .limit(1);
  return row ?? null;
}

export async function activeTemplates(userId: string, q: Db = db): Promise<Templates | null> {
  const [c] = await q
    .select({ templates: campaigns.templates })
    .from(campaigns)
    .where(and(eq(campaigns.userId, userId), eq(campaigns.status, "active")));
  return c ? (c.templates as Templates) : null;
}
