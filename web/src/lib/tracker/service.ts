import "server-only";
import * as Sentry from "@sentry/nextjs";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  campaigns,
  cardReviews,
  cards,
  checkins,
  days,
  missions,
  problemReviews,
  problems,
  profiles,
  readinessSnapshots,
  roadmapNodes,
  roadmapProgress,
  topicProgress,
  topics,
} from "@/db/schema";
import { patternMap } from "@/lib/library/queries";
import { addDays, daysBetween, localDate, weekday } from "./dates";
import {
  cardMissionsToTick,
  type DayStatus,
  dayStatus,
  latestPerProblem,
  matchMission,
  revivable,
  reviveRef,
  revivedDates,
  streak,
} from "./days";
import { applyCheckin, dismiss, postpone, type Result, type Review } from "./ladder";
import { type Level, asLevel } from "./level";
import { planDay } from "./planner";
import { type CardAttempt, dsaArea, localAttempts, overall, topicArea } from "./readiness";
import type { Templates } from "./template";

// Server side of the tracker. Uses the server connection (bypasses RLS), so
// every query here is scoped by the userId the caller passes: always the
// signed-in viewer, or each user in turn for the hourly job.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Db = typeof db | Tx;

/** The user's time zone, or UTC when they have no profile row.
 *
 *  One definition: the Coach's tools and the campaign each had their own, and a
 *  fallback that disagreed would put two parts of the app on different days. */
export async function timezoneOf(userId: string, q: Db = db): Promise<string> {
  const [p] = await q.select({ timezone: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId));
  return p?.timezone ?? "UTC";
}

const TOPIC_AREAS = ["system_design", "cs", "java", "sql"] as const;
const IMPORTANT_DSA = 0.5;
const CANDIDATE_MIN_IMPORTANCE = 0.2;

export type CampaignInfo = {
  id: string;
  startDate: string;
  lengthDays: number;
  templates: Templates;
  companyFocus: { company: string; from: string; to: string } | null;
};

async function context(userId: string, q: Db) {
  const [row] = await q
    .select({
      timezone: profiles.timezone,
      hasPremium: profiles.hasLeetcodePremium,
      level: profiles.level,
      campaignId: campaigns.id,
      startDate: campaigns.startDate,
      lengthDays: campaigns.lengthDays,
      templates: campaigns.templates,
      companyFocus: campaigns.companyFocus,
    })
    .from(profiles)
    .leftJoin(campaigns, and(eq(campaigns.userId, profiles.userId), eq(campaigns.status, "active")))
    .where(eq(profiles.userId, userId));
  if (!row) return null;
  const campaign: CampaignInfo | null = row.campaignId
    ? {
        id: row.campaignId,
        startDate: row.startDate!,
        lengthDays: row.lengthDays!,
        templates: row.templates as Templates,
        companyFocus: (row.companyFocus as CampaignInfo["companyFocus"]) ?? null,
      }
    : null;
  return { timezone: row.timezone, hasPremium: row.hasPremium, level: asLevel(row.level), campaign };
}

/** Close every past day that is still pending, and add missed rows for days the app wasn't opened. */
async function closePastDays(userId: string, campaign: CampaignInfo, today: string, q: Db) {
  const open = await q
    .select({ date: days.date })
    .from(days)
    .where(and(eq(days.userId, userId), eq(days.status, "pending"), lt(days.date, today)));
  for (const { date } of open) {
    const rows = await q
      .select({ status: missions.status, isRevive: missions.isRevive, isExtra: missions.isExtra })
      .from(missions)
      .where(and(eq(missions.userId, userId), eq(missions.date, date)));
    await q
      .update(days)
      .set({ status: dayStatus(rows, true), closedAt: sql`now()` })
      .where(and(eq(days.userId, userId), eq(days.date, date)));
  }
  const [last] = await q
    .select({ date: days.date })
    .from(days)
    .where(and(eq(days.userId, userId), eq(days.campaignId, campaign.id)))
    .orderBy(desc(days.date))
    .limit(1);
  const from = last ? addDays(last.date, 1) : campaign.startDate;
  const gaps: { userId: string; date: string; campaignId: string; status: string; closedAt: string }[] = [];
  for (let d = from; d < today; d = addDays(d, 1)) {
    gaps.push({ userId, date: d, campaignId: campaign.id, status: "missed", closedAt: new Date().toISOString() });
  }
  if (gaps.length) await q.insert(days).values(gaps).onConflictDoNothing();
}

async function areaScores(userId: string, q: Db): Promise<Record<string, number | null>> {
  const [snap] = await q
    .select({ perArea: readinessSnapshots.perArea })
    .from(readinessSnapshots)
    .where(eq(readinessSnapshots.userId, userId))
    .orderBy(desc(readinessSnapshots.date))
    .limit(1);
  const per = (snap?.perArea ?? {}) as Record<string, { score: number | null }>;
  return Object.fromEntries(Object.entries(per).map(([k, v]) => [k, v?.score ?? null]));
}

/** Plan the slots of `forDate`'s weekday, as seen today, leaving out `exclude`. */
async function buildPlan(
  userId: string,
  campaign: CampaignInfo,
  forDate: string,
  today: string,
  hasPremium: boolean,
  level: Level | null,
  q: Db,
  exclude = new Set<string>(),
) {
  const slots = campaign.templates[weekday(forDate)];
  const [map, candidates, attempted, due, topicRows, studied, scores, liveCards, declaredNew] = await Promise.all([
    patternMap(userId, q),
    q
      .select({
        slug: problems.slug,
        title: problems.title,
        patternSlug: problems.patternSlug,
        importance: problems.importance,
        premium: problems.premium,
        companies: problems.companies,
        difficulty: problems.difficulty,
      })
      .from(problems)
      .where(
        and(eq(problems.kind, "leetcode"), sql`${problems.patternSlug} is not null`, gte(problems.importance, CANDIDATE_MIN_IMPORTANCE)),
      ),
    q.selectDistinct({ slug: checkins.problemSlug }).from(checkins).where(eq(checkins.userId, userId)),
    q
      .select({ slug: problemReviews.problemSlug, title: problems.title, dueDate: problemReviews.dueDate })
      .from(problemReviews)
      .innerJoin(problems, eq(problems.slug, problemReviews.problemSlug))
      .where(and(eq(problemReviews.userId, userId), eq(problemReviews.status, "active"), lte(problemReviews.dueDate, today))),
    q
      .select({ slug: topics.slug, name: topics.name, area: topics.domain, importance: topics.importance })
      .from(topics)
      .where(inArray(topics.domain, [...TOPIC_AREAS])),
    q.select({ slug: topicProgress.topicSlug }).from(topicProgress).where(eq(topicProgress.userId, userId)),
    areaScores(userId, q),
    q
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.status, "live"), eq(cards.hidden, false)))
      .limit(1),
    // Topics the reader told the Feed they had not met. A declared gap beats
    // any inference from importance when the planner picks a topic mission.
    q
      .selectDistinct({ slug: cards.topicSlug })
      .from(cardReviews)
      .innerJoin(cards, eq(cards.id, cardReviews.cardId))
      .where(and(eq(cardReviews.userId, userId), eq(cardReviews.outcome, "new_to_me"))),
  ]);
  return planDay({
    date: today,
    slots,
    dueReviews: due.filter((r) => !exclude.has(r.slug)),
    patterns: map.patterns,
    problems: candidates.map((p) => ({
      ...p,
      patternSlug: p.patternSlug!,
      importance: p.importance ?? 0,
      companies: (p.companies ?? {}) as Record<string, number>,
    })),
    attempted: new Set([...attempted.map((a) => a.slug), ...exclude]),
    topics: topicRows.map((t) => ({ ...t, importance: t.importance ?? 0 })),
    studied: new Set([...studied.map((s) => s.slug), ...exclude]),
    declaredNew: new Set(declaredNew.flatMap((d) => (d.slug ? [d.slug] : []))),
    areaScores: scores,
    hasPremium,
    companyFocus: campaign.companyFocus,
    hasLiveCards: liveCards.length > 0,
    level,
  });
}

async function planToday(userId: string, campaign: CampaignInfo, today: string, hasPremium: boolean, level: Level | null, q: Db) {
  const planned = await buildPlan(userId, campaign, today, today, hasPremium, level, q);
  if (planned.length) {
    await q
      .insert(missions)
      .values(
        planned.map((m) => ({
          userId,
          date: today,
          slotType: m.slotType,
          ref: m.ref,
          estMinutes: m.estMinutes,
          status: m.status,
          reason: m.reason,
        })),
      )
      .onConflictDoNothing();
  }
}

export type TodayMission = {
  id: string;
  slotType: "new_problem" | "review" | "topic" | "cards";
  ref: string;
  title: string;
  estMinutes: number;
  status: "open" | "done" | "skipped" | "coming_soon";
  reason: string;
  isRevive: boolean;
  /** Added outside the template (Coach, a solution review): bonus work, doesn't count toward the day. */
  isExtra: boolean;
  reviveOf: string | null;
  /** Topic colour: "dsa" for problems, the topic's area otherwise. */
  area: string;
};

export type TodayView =
  | { state: "no_campaign" }
  | { state: "ended"; campaign: CampaignInfo; grid: { date: string; status: DayStatus | "future" }[] }
  | {
      state: "active";
      today: string;
      dayNumber: number;
      daysLeft: number;
      streak: number;
      status: DayStatus;
      missions: TodayMission[];
      grid: { date: string; status: DayStatus | "future" }[];
      revivable: string[];
      campaign: CampaignInfo;
    };

function grid(campaign: CampaignInfo, rows: { date: string; status: string }[]) {
  const status = new Map(rows.map((r) => [r.date, r.status as DayStatus]));
  return Array.from({ length: campaign.lengthDays }, (_, i) => {
    const date = addDays(campaign.startDate, i);
    return { date, status: status.get(date) ?? ("future" as const) };
  });
}

/**
 * Today's plan, built on first open (and by the hourly job at midnight).
 * The days row doubles as a lock: only the caller that inserts it plans, so
 * two opens racing each other never plan twice.
 */
export async function ensureToday(userId: string, now = new Date(), q: Db = db): Promise<TodayView> {
  const ctx = await context(userId, q);
  if (!ctx?.campaign) return { state: "no_campaign" };
  const { campaign } = ctx;
  const today = localDate(ctx.timezone, now);
  const lastDay = addDays(campaign.startDate, campaign.lengthDays - 1);

  await closePastDays(userId, campaign, today > lastDay ? addDays(lastDay, 1) : today, q);
  if (today > lastDay) {
    const rows = await q
      .select({ date: days.date, status: days.status })
      .from(days)
      .where(and(eq(days.userId, userId), eq(days.campaignId, campaign.id)));
    return { state: "ended", campaign, grid: grid(campaign, rows) };
  }

  // Claim and plan in one transaction: if planning fails the claim rolls back
  // and the next open tries again, and a racing opener waits on the row lock.
  await q.transaction(async (tx) => {
    const claimed = await tx
      .insert(days)
      .values({ userId, date: today, campaignId: campaign.id })
      .onConflictDoNothing()
      .returning({ date: days.date });
    if (claimed.length) await planToday(userId, campaign, today, ctx.hasPremium, ctx.level, tx);
  });
  return todayView(userId, campaign, today, q);
}

async function todayView(userId: string, campaign: CampaignInfo, today: string, q: Db): Promise<TodayView> {
  const [rows, dayRows, started] = await Promise.all([
    q
      .select({
        id: missions.id,
        slotType: missions.slotType,
        ref: missions.ref,
        estMinutes: missions.estMinutes,
        status: missions.status,
        reason: missions.reason,
        isRevive: missions.isRevive,
        isExtra: missions.isExtra,
        reviveOf: missions.reviveOf,
        problemTitle: problems.title,
        topicName: topics.name,
        topicArea: topics.domain,
      })
      .from(missions)
      .leftJoin(problems, eq(problems.slug, missions.ref))
      .leftJoin(topics, eq(topics.slug, missions.ref))
      .where(and(eq(missions.userId, userId), eq(missions.date, today)))
      .orderBy(asc(missions.isRevive), asc(sql`array_position(array['review','new_problem','topic','cards'], ${missions.slotType})`)),
    q
      .select({ date: days.date, status: days.status })
      .from(days)
      .where(and(eq(days.userId, userId), eq(days.campaignId, campaign.id))),
    // Days whose revive already started, so the banner doesn't offer them again.
    q
      .selectDistinct({ date: missions.reviveOf })
      .from(missions)
      .where(and(eq(missions.userId, userId), eq(missions.isRevive, true), gte(missions.reviveOf, addDays(today, -2)))),
  ]);
  const list: TodayMission[] = rows.map((r) => ({
    id: r.id,
    slotType: r.slotType as TodayMission["slotType"],
    ref: r.ref,
    title: r.problemTitle ?? r.topicName ?? "10 cards",
    estMinutes: r.estMinutes,
    status: r.status as TodayMission["status"],
    reason: r.reason,
    isRevive: r.isRevive,
    isExtra: r.isExtra,
    reviveOf: r.reviveOf,
    area: r.slotType === "topic" ? (r.topicArea ?? "system_design") : r.slotType === "cards" ? "cs" : "dsa",
  }));
  const todayRow = dayRows.find((d) => d.date === today);
  return {
    state: "active",
    today,
    dayNumber: daysBetween(campaign.startDate, today) + 1,
    daysLeft: campaign.lengthDays - daysBetween(campaign.startDate, today) - 1,
    streak: streak(dayRows, today),
    status: (todayRow?.status ?? "pending") as DayStatus,
    missions: list,
    grid: grid(campaign, dayRows),
    revivable: revivable(
      dayRows,
      today,
      started.flatMap((r) => (r.date ? [r.date] : [])),
    ),
    campaign,
  };
}

/** Recompute today's status and finish any revive whose missions are all done (skipped ones don't count). */
export async function refreshDay(userId: string, today: string, q: Db) {
  const rows = await q
    .select({ status: missions.status, isRevive: missions.isRevive, isExtra: missions.isExtra, reviveOf: missions.reviveOf })
    .from(missions)
    .where(and(eq(missions.userId, userId), eq(missions.date, today)));
  if (rows.length) {
    await q
      .update(days)
      .set({ status: dayStatus(rows, false) })
      .where(and(eq(days.userId, userId), eq(days.date, today), inArray(days.status, ["pending", "done"])));
  }
  for (const date of revivedDates(rows)) {
    await q
      .update(days)
      .set({ status: "revived" })
      .where(and(eq(days.userId, userId), eq(days.date, date), inArray(days.status, ["missed", "partial"])));
  }
}

// `now` is threaded through rather than read from the clock, the same way
// ensureToday, onCheckins and onCardAnswered already take it. Without it these
// paths cannot be exercised at a pinned time, and check-tracker silently
// stopped ticking missions the moment the real date passed its fixture date.
async function userToday(userId: string, q: Db, now = new Date()) {
  const [p] = await q.select({ timezone: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId));
  return localDate(p?.timezone ?? "UTC", now);
}

function toReview(r: { step: number; dueDate: string; status: string } | undefined): Review | null {
  return r ? { step: r.step as Review["step"], dueDate: r.dueDate, status: r.status as Review["status"] } : null;
}

async function saveReview(userId: string, slug: string, review: Review, q: Db) {
  await q
    .insert(problemReviews)
    .values({ userId, problemSlug: slug, step: review.step, dueDate: review.dueDate, status: review.status })
    .onConflictDoUpdate({
      target: [problemReviews.userId, problemReviews.problemSlug],
      set: { step: review.step, dueDate: review.dueDate, status: review.status, updatedAt: sql`now()` },
    });
}

/**
 * After new check-ins (manual or synced): tick matching missions, move the
 * review ladder once per problem, refresh today's status.
 */
export async function onCheckins(
  userId: string,
  list: { slug: string; result: Result; createdAt: string; checkinId: string }[],
  q: Db = db,
  now = new Date(),
) {
  if (!list.length) return;
  const [profile] = await q.select({ timezone: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId));
  const tz = profile?.timezone ?? "UTC";
  const today = localDate(tz, now);
  const latest = latestPerProblem(list);
  const slugs = latest.map((c) => c.slug);
  const [patterns, open, reviews] = await Promise.all([
    q.select({ slug: problems.slug, patternSlug: problems.patternSlug }).from(problems).where(inArray(problems.slug, slugs)),
    q
      .select({
        id: missions.id,
        slotType: missions.slotType,
        ref: missions.ref,
        status: missions.status,
        patternSlug: problems.patternSlug,
        isRevive: missions.isRevive,
      })
      .from(missions)
      .leftJoin(problems, eq(problems.slug, missions.ref))
      .where(and(eq(missions.userId, userId), eq(missions.date, today))),
    q
      .select()
      .from(problemReviews)
      .where(and(eq(problemReviews.userId, userId), inArray(problemReviews.problemSlug, slugs))),
  ]);
  const patternOf = new Map(patterns.map((p) => [p.slug, p.patternSlug]));
  const reviewOf = new Map(reviews.map((r) => [r.problemSlug, r]));

  for (const c of latest) {
    // Only work done today ticks today's missions; older synced solves still move the ladder.
    const day = localDate(tz, new Date(c.createdAt));
    const id = day === today ? matchMission(open, { slug: c.slug, patternSlug: patternOf.get(c.slug) ?? null }) : null;
    if (id) {
      await q
        .update(missions)
        .set({ status: "done", doneAt: sql`now()`, checkinId: c.checkinId })
        .where(and(eq(missions.id, id), eq(missions.userId, userId)));
      const m = open.find((x) => x.id === id);
      if (m) m.status = "done";
    }
    const next = applyCheckin(toReview(reviewOf.get(c.slug)), c.result, day);
    if (next) await saveReview(userId, c.slug, next, q);
  }
  await refreshDay(userId, today, q);
}

/** Review mission actions: "Not today" (back tomorrow) or "I've got this" (off the ladder). */
export async function skipReview(userId: string, missionId: string, mode: "not_today" | "got_it", q: Db = db) {
  const [m] = await q
    .select({ ref: missions.ref, date: missions.date })
    .from(missions)
    .where(and(eq(missions.id, missionId), eq(missions.userId, userId), eq(missions.slotType, "review")));
  if (!m) return;
  const [r] = await q
    .select()
    .from(problemReviews)
    .where(and(eq(problemReviews.userId, userId), eq(problemReviews.problemSlug, m.ref)));
  const review = toReview(r);
  if (review) await saveReview(userId, m.ref, mode === "not_today" ? postpone(review, m.date) : dismiss(review), q);
  await q
    .update(missions)
    .set({ status: "skipped", doneAt: sql`now()` })
    .where(eq(missions.id, missionId));
  await refreshDay(userId, m.date, q);
}

/** Library "Mark studied": records the topic and ticks today's topic mission for it. */
export async function markStudied(userId: string, topicSlug: string, q: Db = db, now = new Date()) {
  const today = await userToday(userId, q, now);
  await q.insert(topicProgress).values({ userId, topicSlug }).onConflictDoNothing();
  // Real work flows into the roadmap checklist, never the other way: ticking a
  // box must not move readiness, but studying a topic should tick its box.
  const nodes = await q.select({ id: roadmapNodes.id }).from(roadmapNodes).where(eq(roadmapNodes.topicSlug, topicSlug));
  if (nodes.length) {
    await q
      .insert(roadmapProgress)
      .values(nodes.map((n) => ({ userId, nodeId: n.id, source: "topic" })))
      .onConflictDoNothing();
  }
  await q
    .update(missions)
    .set({ status: "done", doneAt: sql`now()` })
    .where(
      and(
        eq(missions.userId, userId),
        eq(missions.date, today),
        eq(missions.slotType, "topic"),
        eq(missions.ref, topicSlug),
        eq(missions.status, "open"),
      ),
    );
  await refreshDay(userId, today, q);
}

export async function unmarkStudied(userId: string, topicSlug: string, q: Db = db) {
  // Studying ticked this topic's roadmap nodes, so undoing it unticks them.
  // Leaving them checked would report coverage the reader just retracted.
  const nodes = await q.select({ id: roadmapNodes.id }).from(roadmapNodes).where(eq(roadmapNodes.topicSlug, topicSlug));
  if (nodes.length) {
    await q.delete(roadmapProgress).where(
      and(
        eq(roadmapProgress.userId, userId),
        // Only the ticks studying put there. A box the reader checked by hand
        // is theirs, and undoing a study is not a claim about it.
        eq(roadmapProgress.source, "topic"),
        inArray(
          roadmapProgress.nodeId,
          nodes.map((n) => n.id),
        ),
      ),
    );
  }
  await q.delete(topicProgress).where(and(eq(topicProgress.userId, userId), eq(topicProgress.topicSlug, topicSlug)));
}

/** Copy a missed day's unfinished missions into today as extra work. */
export async function startRevive(userId: string, date: string, q: Db = db, now = new Date()) {
  const today = await userToday(userId, q, now);
  const dayRows = await q
    .select({ date: days.date, status: days.status })
    .from(days)
    .where(and(eq(days.userId, userId), gte(days.date, addDays(today, -2))));
  if (!revivable(dayRows, today).includes(date)) return { error: "That day can't be revived any more." };

  const started = await q
    .select({ id: missions.id })
    .from(missions)
    .where(and(eq(missions.userId, userId), eq(missions.isRevive, true), eq(missions.reviveOf, date)));
  if (started.length) return { error: "That day's missions are already on today's list." };

  const todays = new Set(
    (
      await q
        .select({ ref: missions.ref })
        .from(missions)
        .where(and(eq(missions.userId, userId), eq(missions.date, today)))
    ).map((m) => m.ref),
  );
  const leftovers: { slotType: string; ref: string; estMinutes: number }[] = await q
    .select({ slotType: missions.slotType, ref: missions.ref, estMinutes: missions.estMinutes })
    .from(missions)
    .where(
      and(
        eq(missions.userId, userId),
        eq(missions.date, date),
        eq(missions.status, "open"),
        eq(missions.isRevive, false),
        eq(missions.isExtra, false),
      ),
    );

  // Leftovers already on today's list (the same unsolved problem, the same
  // topic) get a fresh mission of the same kind, so reviving is real extra work.
  // A day that was never opened has no leftovers: its whole template is planned.
  let extra = leftovers.filter((m) => !todays.has(reviveRef(m, date)));
  const collided = leftovers.filter((m) => todays.has(reviveRef(m, date)));
  if (!leftovers.length || collided.length) {
    const ctx = await context(userId, q);
    if (!ctx?.campaign) return { error: "No active plan." };
    const exclude = new Set([...todays, ...leftovers.map((m) => m.ref)]);
    const plan = async () =>
      (
        await buildPlan(userId, ctx.campaign!, date, today, ctx.hasPremium, ctx.level, q, new Set([...exclude, ...extra.map((m) => m.ref)]))
      ).filter((m) => m.status === "open");
    if (!leftovers.length) extra = await plan();
    else {
      // Same kind if the catalog has one left, else any other open mission;
      // plan again when one template's worth isn't enough to replace them all.
      let pending = [...collided];
      for (let round = 0; pending.length && round < 3; round++) {
        const planned = await plan();
        if (!planned.length) break;
        pending = pending.filter((c) => {
          const same = planned.findIndex((p) => p.slotType === c.slotType);
          const [picked] = planned.splice(same >= 0 ? same : 0, 1);
          if (!picked) return true;
          extra.push(picked);
          return false;
        });
      }
    }
  }
  if (!extra.length) return { error: "Nothing left to revive that day." };
  const inserted = await q
    .insert(missions)
    .values(
      extra.map((m) => ({
        userId,
        date: today,
        slotType: m.slotType,
        ref: reviveRef(m, date),
        estMinutes: m.estMinutes,
        status: "open",
        reason: `Reviving ${date}`,
        isRevive: true,
        reviveOf: date,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: missions.id });
  if (!inserted.length) return { error: "Couldn't add that day's missions. Try again." };
  return { ok: true };
}

/** Readiness per area and overall, stored for the dial, the trend and friends. */
export async function snapshotReadiness(userId: string, date: string, q: Db = db) {
  const [important, attempts, topicRows, studied, [profile], cardRows] = await Promise.all([
    q
      .select({ slug: problems.slug, importance: problems.importance })
      .from(problems)
      .where(
        and(
          eq(problems.kind, "leetcode"),
          or(eq(problems.nc150, true), eq(problems.blind75, true), gte(problems.importance, IMPORTANT_DSA)),
        ),
      ),
    q
      .select({ slug: checkins.problemSlug, result: checkins.result, createdAt: checkins.createdAt })
      .from(checkins)
      .innerJoin(problems, eq(problems.slug, checkins.problemSlug))
      .where(
        and(eq(checkins.userId, userId), eq(problems.kind, "leetcode"), isNull(sql`nullif(array_length(${problems.topicSlugs}, 1), 0)`)),
      ),
    q
      .select({ slug: topics.slug, area: topics.domain, importance: topics.importance })
      .from(topics)
      .where(inArray(topics.domain, [...TOPIC_AREAS])),
    q.select({ slug: topicProgress.topicSlug }).from(topicProgress).where(eq(topicProgress.userId, userId)),
    q.select({ timezone: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId)),
    q
      .select({
        topic: topics.slug,
        area: topics.domain,
        score: cardReviews.score,
        outcome: cardReviews.outcome,
        createdAt: cardReviews.createdAt,
      })
      .from(cardReviews)
      .innerJoin(cards, eq(cards.id, cardReviews.cardId))
      .innerJoin(topics, eq(topics.slug, cards.topicSlug))
      .where(eq(cardReviews.userId, userId)),
  ]);
  const tz = profile?.timezone ?? "UTC";
  const cardAttempts = (area: string): CardAttempt[] =>
    cardRows
      .filter((r) => r.area === area)
      // A declared card is not an attempt, so it never moves accuracy.
      .filter((r) => r.outcome !== "new_to_me" && r.outcome !== "known")
      .map((r) => ({ topic: r.topic, score: r.score, skipped: r.outcome === "skipped", date: localDate(tz, new Date(r.createdAt)) }));
  const studiedSet = new Set(studied.map((s) => s.slug));
  const perArea: Record<string, { coverage: number; accuracy: number | null; score: number | null }> = {
    dsa: dsaArea(
      important.map((p) => ({ slug: p.slug, importance: p.importance ?? 0 })),
      localAttempts(
        attempts.map((a) => ({ ...a, result: a.result as Result })),
        tz,
      ),
      date,
      cardAttempts("dsa"),
    ),
  };
  for (const area of TOPIC_AREAS) {
    perArea[area] = topicArea(
      topicRows.filter((t) => t.area === area).map((t) => ({ slug: t.slug, importance: t.importance ?? 0 })),
      studiedSet,
      { attempts: cardAttempts(area), today: date },
    );
  }
  const score = overall(Object.fromEntries(Object.entries(perArea).map(([k, v]) => [k, v.score])));
  await q
    .insert(readinessSnapshots)
    .values({ userId, date, overall: score, perArea })
    .onConflictDoUpdate({ target: [readinessSnapshots.userId, readinessSnapshots.date], set: { overall: score, perArea } });
  return { overall: score, perArea };
}

/**
 * Side stats on Today: readiness, problems solved, reviews due. Readiness is
 * computed now, like the dial on Me, so the two never show different numbers.
 * It's a side stat, so if it fails Today still renders with "—" in its place.
 */
export async function todayStats(userId: string, today: string, q: Db = db) {
  const [readiness, [solved], [due]] = await Promise.all([
    snapshotReadiness(userId, today, q).then(
      (r) => r.overall,
      (error: unknown) => {
        Sentry.captureException(error);
        return null;
      },
    ),
    q
      .select({ n: sql<number>`count(distinct ${checkins.problemSlug})::int` })
      .from(checkins)
      .where(and(eq(checkins.userId, userId), eq(checkins.result, "solved"))),
    q
      .select({ n: sql<number>`count(*)::int` })
      .from(problemReviews)
      .where(and(eq(problemReviews.userId, userId), eq(problemReviews.status, "active"), lte(problemReviews.dueDate, today))),
  ]);
  return { readiness, solved: solved?.n ?? 0, reviewsDue: due?.n ?? 0 };
}

export async function isStudied(userId: string, topicSlug: string, q: Db = db) {
  const rows = await q
    .select({ slug: topicProgress.topicSlug })
    .from(topicProgress)
    .where(and(eq(topicProgress.userId, userId), eq(topicProgress.topicSlug, topicSlug)));
  return rows.length > 0;
}

/** After a card answer: tick one "cards" mission per 10 answers today (skips don't count). */
export async function onCardAnswered(userId: string, q: Db = db, now = new Date()) {
  const [profile] = await q.select({ timezone: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId));
  const tz = profile?.timezone ?? "UTC";
  const today = localDate(tz, now);
  const [counted, todays] = await Promise.all([
    q
      .select({ n: sql<number>`count(*)::int` })
      .from(cardReviews)
      .where(
        and(
          eq(cardReviews.userId, userId),
          sql`${cardReviews.outcome} in ('correct', 'wrong')`,
          sql`(${cardReviews.createdAt} at time zone ${tz})::date = ${today}::date`,
        ),
      ),
    q
      .select({ id: missions.id, slotType: missions.slotType, status: missions.status, isRevive: missions.isRevive })
      .from(missions)
      .where(and(eq(missions.userId, userId), eq(missions.date, today))),
  ]);
  const ids = cardMissionsToTick(todays, counted[0]?.n ?? 0);
  if (ids.length) {
    await q
      .update(missions)
      .set({ status: "done", doneAt: sql`now()` })
      .where(and(eq(missions.userId, userId), inArray(missions.id, ids)));
    await refreshDay(userId, today, q);
  }
}
