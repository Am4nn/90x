import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { readSpend } from "@/lib/ai/usage";
import { type SourceGroup, sourceGroup } from "@/lib/analytics/source";
import { getSettings } from "@/lib/settings";
import { addDays } from "@/lib/tracker/dates";
import { key } from "@/lib/upstash/keys";
import { redis } from "@/lib/upstash/redis";
import {
  accuracy,
  activation,
  type Cohort,
  DECLARATION_OUTCOMES,
  fillDays,
  median,
  type Range,
  type Ratio,
  returnRate,
  stickiness,
  windowDays,
} from "./analytics-math";

// Everything /admin/analytics shows, computed from the tables the app already writes and
// cached for a few minutes per range. Aggregates only: no query here returns a person.
// "Day" is the reader's own calendar day (profiles.timezone, UTC if unset), as on Today.
// Test accounts (@e2e.test) are left out. The caller has already checked the viewer is an admin.

const CACHE_SECONDS = 300;

export type DayCount = { day: string; n: number };
export type Analytics = {
  range: Range;
  today: string;
  generatedAt: string;
  growth: { signups: DayCount[]; total: number; bySource: { group: SourceGroup; n: number }[] };
  activation: { signups: number; activated: Ratio; medianMinutes: number | null };
  retention: { d1: Ratio; d7: Ratio; cohorts: Cohort[] };
  actives: { daily: DayCount[]; dau7: number; wau: number; mau: number; stickiness: number | null };
  engagement: {
    answers: DayCount[];
    answered: number;
    skipped: number;
    accuracy: Ratio;
    coach: DayCount[];
    coachTotal: number;
    missions: Ratio;
  };
  cost: {
    daily: { day: string; usd: number }[];
    total: number;
    activeUsers: number;
    perActive: number | null;
    lifetime: number;
    cap: number;
  };
};

const tz = sql`coalesce(nullif(p.timezone, ''), 'UTC')`;
// The people who count: every profile except the e2e test accounts.
const people = sql`public.profiles p join auth.users au on au.id = p.user_id and au.email not like '%@e2e.test'`;
const localDayOf = (ts: SQL) => sql`(${ts} at time zone ${tz})::date`;
const dayText = (d: SQL) => sql`to_char(${d}, 'YYYY-MM-DD')`;
const declarations = sql.join(
  DECLARATION_OUTCOMES.map((o) => sql`${o}`),
  sql`, `,
);

/** One day before the given date at UTC midnight: a local day can start up to a day off UTC. */
const t = (d: string) => sql`((${d}::date - 1)::timestamp at time zone 'utc')`;

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];

/** One row per person per local day on which they did something real (see the "active" rule). */
const activeDays = (since: SQL) => sql`
  raw as (
    select user_id, created_at as ts from public.card_reviews where created_at >= ${since} and outcome not in (${declarations})
    union all select user_id, created_at from public.coach_messages where created_at >= ${since} and role = 'user'
    union all select user_id, created_at from public.checkins where created_at >= ${since}
    union all select user_id, updated_at from public.problem_reviews where updated_at >= ${since}
    union all select user_id, started_at from public.mocks where started_at >= ${since}
  ), ad as (
    select distinct r.user_id, ${localDayOf(sql`r.ts`)} as day
    from raw r join ${people} on p.user_id = r.user_id
  )`;

async function compute(range: Range, now: Date): Promise<Analytics> {
  const today = now.toISOString().slice(0, 10);
  const days = windowDays(range, today);
  const from = days[0]!;
  // Activity is read from a day earlier than needed, because a local day can start up to a day off UTC.
  const wide = Math.max(range, 30);
  const activityFrom = addDays(today, -(wide - 1));
  const fromDate = sql`${from}::date`;

  const [signupRows, firstAnswers, cohortRows, dailyActive, activeTotals, answerRows, coachRows, missionRows, costRows, spend, settings] =
    await Promise.all([
      rows<{ day: string; source: string | null; referrer: string | null; n: number }>(sql`
      select ${dayText(localDayOf(sql`p.created_at`))} as day, p.signup_source as source, p.signup_referrer as referrer, count(*)::int as n
      from ${people}
      where p.created_at >= ${t(from)} and ${localDayOf(sql`p.created_at`)} >= ${fromDate}
      group by 1, 2, 3`),
      rows<{ signups: number; mins: number[] | null }>(sql`
      select count(*)::int as signups,
             (array_agg(extract(epoch from (fa.ts - p.created_at)) / 60.0) filter (where fa.ts is not null))::float8[] as mins
      from ${people}
      left join lateral (
        select min(cr.created_at) as ts from public.card_reviews cr
        where cr.user_id = p.user_id and cr.outcome in ('correct', 'wrong')
      ) fa on true
      where p.created_at >= ${t(from)} and ${localDayOf(sql`p.created_at`)} >= ${fromDate}`),
      rows<{ day: string; size: number; d1: number; d7: number }>(sql`
      with ${activeDays(t(activityFrom))},
      u as (
        select p.user_id, ${localDayOf(sql`p.created_at`)} as signup_day
        from ${people}
        where p.created_at >= ${t(from)} and ${localDayOf(sql`p.created_at`)} >= ${fromDate}
      )
      select ${dayText(sql`u.signup_day`)} as day, count(*)::int as size,
             (count(*) filter (where exists (select 1 from ad where ad.user_id = u.user_id and ad.day = u.signup_day + 1)))::int as d1,
             (count(*) filter (where exists (select 1 from ad where ad.user_id = u.user_id and ad.day = u.signup_day + 7)))::int as d7
      from u group by u.signup_day order by u.signup_day`),
      rows<{ day: string; n: number }>(sql`
      with ${activeDays(t(activityFrom))}
      select ${dayText(sql`day`)} as day, count(*)::int as n from ad where day >= ${fromDate} group by day`),
      rows<{ wau: number; mau: number; in_range: number }>(sql`
      with ${activeDays(t(activityFrom))}
      select count(distinct user_id) filter (where day >= ${addDays(today, -6)}::date)::int as wau,
             count(distinct user_id) filter (where day >= ${addDays(today, -29)}::date)::int as mau,
             count(distinct user_id) filter (where day >= ${fromDate})::int as in_range
      from ad`),
      rows<{ day: string; correct: number; wrong: number; skipped: number }>(sql`
      select ${dayText(localDayOf(sql`cr.created_at`))} as day,
             (count(*) filter (where cr.outcome = 'correct'))::int as correct,
             (count(*) filter (where cr.outcome = 'wrong'))::int as wrong,
             (count(*) filter (where cr.outcome = 'skipped'))::int as skipped
      from public.card_reviews cr join ${people} on p.user_id = cr.user_id
      where cr.created_at >= ${t(from)} and ${localDayOf(sql`cr.created_at`)} >= ${fromDate}
      group by 1`),
      rows<{ day: string; n: number }>(sql`
      select ${dayText(localDayOf(sql`m.created_at`))} as day, count(*)::int as n
      from public.coach_messages m join ${people} on p.user_id = m.user_id
      where m.role = 'user' and m.created_at >= ${t(from)} and ${localDayOf(sql`m.created_at`)} >= ${fromDate}
      group by 1`),
      rows<{ done: number; total: number }>(sql`
      select (count(*) filter (where m.status = 'done'))::int as done,
             (count(*) filter (where m.status in ('open', 'done', 'skipped')))::int as total
      from public.missions m join ${people} on p.user_id = m.user_id
      where m.date >= ${fromDate} and m.date <= ${today}::date`),
      rows<{ day: string; usd: number }>(sql`
      select to_char(created_at at time zone 'utc', 'YYYY-MM-DD') as day, coalesce(sum(cost_usd), 0)::float8 as usd
      from public.ai_usage where created_at >= (${fromDate}::timestamp at time zone 'utc') group by 1`),
      readSpend(null, now),
      getSettings(),
    ]);

  const dayBy = <R extends { day: string }>(list: R[], pick: (r: R) => number): DayCount[] =>
    fillDays(
      list.map((r) => ({ day: r.day, n: Number(pick(r)) })),
      days,
    );

  // Signups, with the sources folded into the four buckets the page shows.
  const signups = dayBy(signupRows, (r) => r.n);
  const groups: Record<SourceGroup, number> = { linkedin: 0, other: 0, direct: 0, unknown: 0 };
  for (const r of signupRows) groups[sourceGroup(r.source, r.referrer)] += Number(r.n);
  const totalSignups = signups.reduce((s, d) => s + d.n, 0);

  const first = firstAnswers[0];
  const minutes = (first?.mins ?? []).map((m) => Math.max(0, Number(m)));
  const cohorts = cohortRows.map((c) => ({ day: c.day, size: Number(c.size), d1: Number(c.d1), d7: Number(c.d7) }));

  const daily = dayBy(dailyActive, (r) => r.n);
  const totals = activeTotals[0];
  const wau = Number(totals?.wau ?? 0);
  const answers = answerRows.map((r) => ({ day: r.day, n: Number(r.correct) + Number(r.wrong) }));
  const correct = answerRows.reduce((s, r) => s + Number(r.correct), 0);
  const wrong = answerRows.reduce((s, r) => s + Number(r.wrong), 0);
  const coach = dayBy(coachRows, (r) => r.n);
  const mission = missionRows[0];
  const usd = fillDays(
    costRows.map((r) => ({ day: r.day, n: Number(r.usd) })),
    days,
  ).map((d) => ({ day: d.day, usd: d.n }));
  const totalUsd = usd.reduce((s, d) => s + d.usd, 0);
  const activeUsers = Number(totals?.in_range ?? 0);

  return {
    range,
    today,
    generatedAt: now.toISOString(),
    growth: {
      signups,
      total: totalSignups,
      bySource: (["linkedin", "other", "direct", "unknown"] as const).map((group) => ({ group, n: groups[group] })),
    },
    activation: {
      signups: Number(first?.signups ?? 0),
      activated: activation(minutes.length, Number(first?.signups ?? 0)),
      medianMinutes: median(minutes),
    },
    retention: { d1: returnRate(cohorts, 1, today), d7: returnRate(cohorts, 7, today), cohorts },
    actives: {
      daily,
      dau7: Math.round((daily.slice(-7).reduce((s, d) => s + d.n, 0) / 7) * 10) / 10,
      wau,
      mau: Number(totals?.mau ?? 0),
      stickiness: stickiness(
        daily.slice(-7).map((d) => d.n),
        wau,
      ),
    },
    engagement: {
      answers: fillDays(answers, days),
      answered: correct + wrong,
      skipped: answerRows.reduce((s, r) => s + Number(r.skipped), 0),
      accuracy: accuracy(correct, wrong),
      coach,
      coachTotal: coach.reduce((s, d) => s + d.n, 0),
      missions: {
        part: Number(mission?.done ?? 0),
        whole: Number(mission?.total ?? 0),
        pct: mission?.total ? Math.round((Number(mission.done) / Number(mission.total)) * 100) : null,
      },
    },
    cost: {
      daily: usd,
      total: totalUsd,
      activeUsers,
      perActive: activeUsers > 0 ? totalUsd / activeUsers : null,
      lifetime: spend.lifetime,
      cap: settings.aiLifetimeCapUsd,
    },
  };
}

/** The dashboard for one range, from Redis when computed in the last few minutes. A Redis outage only
 *  costs the speed-up: the numbers are then computed straight from the tables. */
export async function analytics(range: Range): Promise<Analytics> {
  const k = key("analytics", String(range));
  try {
    const hit = await redis().get<Analytics>(k);
    if (hit && typeof hit === "object" && hit.range === range) return hit;
  } catch (e) {
    console.error("analytics cache unreadable", e);
  }
  const fresh = await compute(range, new Date());
  try {
    await redis().set(k, JSON.stringify(fresh), { ex: CACHE_SECONDS });
  } catch (e) {
    console.error("analytics cache not written", e);
  }
  return fresh;
}

/** Computes without the cache; the database check script runs every query through this. */
export const computeAnalytics = compute;
