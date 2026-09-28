import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, cardReviews, cards, checkins, days, mocks, problems, profiles, readinessSnapshots, topics } from "@/db/schema";
import { patternMap } from "@/lib/library/queries";
import { addDays, daysBetween, localDate } from "@/lib/tracker/dates";
import { streak } from "@/lib/tracker/days";
import { scoreboard } from "@/lib/tracker/me";
import { type Db, ensureToday, snapshotReadiness } from "@/lib/tracker/service";
import type { Templates } from "@/lib/tracker/template";

// What the coach's read tools look up. Every function takes the signed-in
// user's id and reads only that user's private rows; the one exception,
// friendSummaryData, reads other users' public stats and
// nothing else. The connection bypasses RLS, so the scoping here is the guard.
// Each takes `q` so scripts/check-coach-tools.ts can run them in a rolled-back
// transaction.

const DAY_MS = 86_400_000;
const WEAK_WINDOW_DAYS = 30;
const ACTIVITY_DAYS = 14;
const MAX_ROWS = 10;

async function timezoneOf(userId: string, q: Db) {
  const [p] = await q.select({ timezone: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId));
  return p?.timezone ?? "UTC";
}

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

export type CardFilters = { topic?: string; format?: string; missed?: boolean; limit?: number };

export async function findCardsData(userId: string, filters: CardFilters, q: Db = db) {
  const latest = q
    .selectDistinctOn([cardReviews.cardId], { cardId: cardReviews.cardId, outcome: cardReviews.outcome, at: cardReviews.createdAt })
    .from(cardReviews)
    .where(eq(cardReviews.userId, userId))
    .orderBy(cardReviews.cardId, desc(cardReviews.createdAt))
    .as("latest");
  const where = [eq(cards.status, "live"), eq(cards.hidden, false)];
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
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (!url || !token) throw new Error("UPSTASH_VECTOR_REST_URL / TOKEN are not set");
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

export async function liveCards(ids: string[], q: Db = db) {
  if (!ids.length) return [];
  return q
    .select({ id: cards.id, topic: topics.name })
    .from(cards)
    .innerJoin(topics, eq(topics.slug, cards.topicSlug))
    .where(and(inArray(cards.id, ids), eq(cards.status, "live"), eq(cards.hidden, false)));
}

export async function problemBySlug(slug: string, q: Db = db) {
  const [row] = await q.select({ slug: problems.slug, title: problems.title }).from(problems).where(eq(problems.slug, slug));
  return row ?? null;
}

export async function topicBySlugOrName(text: string, q: Db = db) {
  const [row] = await q
    .select({ slug: topics.slug, name: topics.name })
    .from(topics)
    .where(sql`${topics.domain} <> 'dsa' and (${topics.slug} = ${slugOf(text)} or lower(${topics.name}) = lower(${text.trim()}))`)
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
