import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { readSpend } from "@/lib/ai/usage";
import { type SourceGroup, sourceGroup } from "@/lib/analytics/source";
import { logError } from "@/lib/log";
import { getSettings } from "@/lib/settings";
import type { Settings } from "@/lib/settings-rules";
import { addDays } from "@/lib/tracker/dates";
import { redis } from "@/lib/upstash/redis";
import {
  ACTIVATING_OUTCOMES,
  ANALYTICS_VERSION,
  type AreaRow,
  analyticsCacheKey,
  type Demo,
  type DemoEvent,
  demoFunnel,
  DECLARATION_OUTCOMES,
  type FunnelCounts,
  fillDays,
  foldAreas,
  GATE_DAYS,
  isCachedFor,
  localDay,
  maskEmail,
  mondayOf,
  type Range,
  weeklySeries,
  windowDays,
} from "./analytics-math";

// Everything /admin/analytics shows, computed from the tables the app already writes and cached for a few
// minutes per range: one parallel round of aggregate queries. "Day" is the reader's own calendar day
// (profiles.timezone, UTC if unset), as on Today. Admins and test accounts (@e2e.test) are left out of every
// number through `people`; AI spend is the one exception, as it shows all of the money (split readers vs the rest).
// The People list is the one per-person query: 20 rows, emails masked here, on the server.
// The caller has already checked the viewer is an admin.

const CACHE_SECONDS = 300;
/** Weeks of activity read for the 8-week sparkline and the sign-up-week grid. */
const WEEKS = 8;
const COHORT_WEEKS = 6;
const PEOPLE = 20;

export type DayCount = { day: string; n: number };
export type GateCounts = { launchDate: string; signups: number; activated: number; returners: number };
const ACTION_KINDS = ["cards", "missions", "lessons", "coach", "mocks"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
export type WeekCohort = { week: string; size: number; back: [number, number, number] };
type Person = {
  who: string;
  lastSeenAt: string;
  dayN: number | null;
  length: number | null;
  answers7: number;
  source: SourceGroup;
};

export type Analytics = {
  version: number;
  range: Range;
  today: string;
  generatedAt: string;
  launchDate: string | null;
  here: {
    /** Active today so far, and on the same weekday last week up to the same local time. */
    today: number;
    lastWeekSoFar: number;
    daily14: number[];
    wau: number;
    wauPrev: number;
    weekly: number[];
    signups: number;
    signupsPrev: number;
    signupsDaily: DayCount[];
  };
  actives: DayCount[];
  /** Distinct people active in the range. */
  activeUsers: number;
  cohorts: WeekCohort[];
  gate: GateCounts | null;
  actions: Record<ActionKind, DayCount[]>;
  reopens: number;
  funnel: FunnelCounts;
  areas: AreaRow[];
  sources: { group: SourceGroup; n: number }[];
  share: { opened: number; invites: number; shared: number; views: number; sharers: { who: string; n: number }[] };
  cost: {
    daily: { day: string; readers: number; builds: number }[];
    dailyCap: number;
    lifetime: number;
    cap: number;
    last30: number;
  };
  reports: { total: number; open: number; latest: { at: string; message: string; open: boolean }[] };
  people: Person[];
  /** The signed-out /try demo: anonymous visit events, so nothing here is about a person. */
  demo: Demo & {
    /** Accounts created in the range whose sign-in button was on /try (admins and e2e accounts left out). */
    signups: number;
  };
};

const tz = sql`coalesce(nullif(p.timezone, ''), 'UTC')`;
// The people who count: every profile except the e2e test accounts and the admins.
const people = sql`public.profiles p join auth.users au on au.id = p.user_id and lower(coalesce(au.email, '')) not like '%@e2e.test'
  and not exists (select 1 from public.user_approvals ua where ua.user_id = p.user_id and ua.is_admin)`;
const localDayOf = (ts: SQL) => sql`(${ts} at time zone ${tz})::date`;
const dayText = (d: SQL) => sql`to_char(${d}, 'YYYY-MM-DD')`;
const list = (values: readonly string[]) =>
  sql.join(
    values.map((o) => sql`${o}`),
    sql`, `,
  );
const activating = list(ACTIVATING_OUTCOMES);
const declarations = list(DECLARATION_OUTCOMES);

/** One day before the given date at UTC midnight: a local day can start up to a day off UTC. */
const t = (d: string) => sql`((${d}::date - 1)::timestamp at time zone 'utc')`;
/** Rows of `ts` on or after local day `d`, using the index on `ts` first. */
const since = (ts: SQL, d: string) => sql`${ts} >= ${t(d)} and ${localDayOf(ts)} >= ${d}::date`;

const sum = (xs: { n: number }[]) => xs.reduce((s, d) => s + d.n, 0);
const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];

/** `raw`: every real action (the "active" rule) with its time; `ad`: one row per counted person per
 *  local day on which they did one. */
const activeDays = (from: SQL, until?: SQL) => sql`
  raw as (
    select user_id, created_at as ts from public.card_reviews where created_at >= ${from} ${until ? sql`and created_at < ${until}` : sql``} and outcome not in (${declarations})
    union all select user_id, created_at from public.coach_messages where created_at >= ${from} ${until ? sql`and created_at < ${until}` : sql``} and role = 'user'
    union all select user_id, created_at from public.checkins where created_at >= ${from} ${until ? sql`and created_at < ${until}` : sql``}
    union all select user_id, updated_at from public.problem_reviews where updated_at >= ${from} ${until ? sql`and updated_at < ${until}` : sql``}
    union all select user_id, started_at from public.mocks where started_at >= ${from} ${until ? sql`and started_at < ${until}` : sql``}
  ), ad as (
    select distinct r.user_id, ${localDayOf(sql`r.ts`)} as day
    from raw r join ${people} on p.user_id = r.user_id
  )`;

/** Signups in the launch window, how many answered a card right or wrong, and how many of them are week-2
 *  returners: active on a local day 7 or more days after their own signup day (the "real action"
 *  rule, via `ad`). The window is [launch, launch + 30 days), end exclusive for signups and activity alike,
 *  so a closed gate stops moving. */
export async function launchGateCounts(launchDate: string): Promise<Omit<GateCounts, "launchDate">> {
  const launch = sql`${launchDate}::date`;
  const end = sql`${addDays(launchDate, GATE_DAYS)}::date`;
  const [row] = await rows<{ signups: number; activated: number; returners: number }>(sql`
    with ${activeDays(t(launchDate), t(addDays(launchDate, GATE_DAYS + 2)))},
    u as (
      select p.user_id, ${localDayOf(sql`p.created_at`)} as signup_day,
             exists (
               select 1 from public.card_reviews cr
               where cr.user_id = p.user_id and cr.outcome in (${activating})
                 and cr.created_at >= ${t(launchDate)} and ${localDayOf(sql`cr.created_at`)} < ${end}
             ) as activated
      from ${people}
      where p.created_at >= ${t(launchDate)} and ${localDayOf(sql`p.created_at`)} >= ${launch} and ${localDayOf(sql`p.created_at`)} < ${end}
    )
    select count(*)::int as signups,
           (count(*) filter (where u.activated))::int as activated,
           (count(*) filter (where exists (
             select 1 from ad where ad.user_id = u.user_id and ad.day >= u.signup_day + 7 and ad.day < ${end}
           )))::int as returners
    from u`);
  return { signups: Number(row?.signups ?? 0), activated: Number(row?.activated ?? 0), returners: Number(row?.returners ?? 0) };
}

type ActivityRow = {
  today: number;
  last_week: number;
  in_range: number;
  daily: { day: string; n: number }[] | null;
  weeks: { w: number; n: number }[] | null;
  cohorts: { week: string; size: number; w2: number; w3: number; w4: number }[] | null;
  funnel: { signed_up: number; setup: number; answered: number; finished: number; old_enough: number; came_back: number };
};

/** Everything built on `ad` in one statement, so the activity CTE is computed once per range. */
function activity(today: string, from: string, activityFrom: string, cohortFrom: string) {
  const d = sql`${today}::date`;
  return rows<ActivityRow>(sql`
    with ${activeDays(t(activityFrom))},
    lt as (
      select r.user_id, (r.ts at time zone ${tz}) as at, (now() at time zone ${tz})::time as now_t
      from raw r join ${people} on p.user_id = r.user_id
      where r.ts >= ${t(addDays(today, -7))}
    ),
    signed as (
      select p.user_id, ${localDayOf(sql`p.created_at`)} as sd, p.setup_done_at is not null as setup
      from ${people} where ${since(sql`p.created_at`, cohortFrom < from ? cohortFrom : from)}
    ),
    f as (
      select s.*,
             exists (select 1 from public.card_reviews cr where cr.user_id = s.user_id and cr.outcome in (${activating})) as answered,
             exists (select 1 from public.days dd where dd.user_id = s.user_id and dd.status = 'done') as finished,
             exists (select 1 from ad where ad.user_id = s.user_id and ad.day >= s.sd + 7) as came_back
      from signed s where s.sd >= ${from}::date
    )
    select
      (select count(distinct user_id) from lt where at::date = ${d})::int as today,
      (select count(distinct user_id) from lt where at::date = ${d} - 7 and at::time <= now_t)::int as last_week,
      (select count(distinct user_id) from ad where day >= ${from}::date and day <= ${d})::int as in_range,
      (select json_agg(json_build_object('day', ${dayText(sql`day`)}, 'n', n)) from (
        select day, count(*)::int as n from ad where day >= ${activityFrom}::date group by day
      ) x) as daily,
      (select json_agg(json_build_object('w', w, 'n', n)) from (
        select (${d} - day) / 7 as w, count(distinct user_id)::int as n from ad
        where day > ${d} - ${sql.raw(String(WEEKS * 7))} and day <= ${d} group by 1
      ) x) as weeks,
      (select json_agg(json_build_object('week', ${dayText(sql`wk`)}, 'size', size, 'w2', w2, 'w3', w3, 'w4', w4) order by wk) from (
        select date_trunc('week', s.sd)::date as wk, count(*)::int as size,
               (count(*) filter (where exists (select 1 from ad where ad.user_id = s.user_id and ad.day >= date_trunc('week', s.sd)::date + 7 and ad.day < date_trunc('week', s.sd)::date + 14)))::int as w2,
               (count(*) filter (where exists (select 1 from ad where ad.user_id = s.user_id and ad.day >= date_trunc('week', s.sd)::date + 14 and ad.day < date_trunc('week', s.sd)::date + 21)))::int as w3,
               (count(*) filter (where exists (select 1 from ad where ad.user_id = s.user_id and ad.day >= date_trunc('week', s.sd)::date + 21 and ad.day < date_trunc('week', s.sd)::date + 28)))::int as w4
        from signed s where s.sd >= ${cohortFrom}::date and s.sd <= ${d} group by 1
      ) x) as cohorts,
      (select json_build_object(
        'signed_up', count(*),
        'setup', count(*) filter (where setup),
        'answered', count(*) filter (where setup and answered),
        'finished', count(*) filter (where setup and answered and finished),
        'old_enough', count(*) filter (where sd + 7 < ${d}),
        'came_back', count(*) filter (where sd + 7 < ${d} and came_back)
      ) from f) as funnel`);
}

/** `timezone` is the viewer's: "today" and the last bar are their calendar day, so a reader's evening in
 *  India is not dropped while it is still yesterday in UTC. */
async function compute(range: Range, now: Date, loaded?: Settings, timezone = "UTC"): Promise<Analytics> {
  const settings = loaded ?? (await getSettings());
  const today = localDay(now, timezone);
  const days = windowDays(range, today);
  const from = days[0]!;
  const prevFrom = addDays(from, -range);
  // Activity is read wide enough for the 8-week sparkline and the sign-up-week grid, whatever the range.
  const activityFrom = addDays(today, -(Math.max(range, WEEKS * 7) - 1));
  const cohortFrom = addDays(mondayOf(today), -7 * (COHORT_WEEKS - 1));
  // Spend is read for at least 30 days: the lifetime card's pace uses the last 30.
  // AI spend is kept in UTC days (as the cap is), so its axis ends on the UTC date, not the viewer's.
  const utcToday = localDay(now, "UTC");
  const spendFrom = addDays(utcToday, -(Math.max(range, 30) - 1));
  const counted = (alias: string) => sql`exists (select 1 from ${people} where p.user_id = ${sql.raw(alias)}.user_id)`;

  const [
    signupRows,
    [act],
    actionRows,
    areaRows,
    [share],
    sharerRows,
    costRows,
    [reports],
    peopleRows,
    spend,
    gateCounts,
    demoRows,
    [demoSignups],
  ] = await Promise.all([
    rows<{ day: string; source: string | null; referrer: string | null; n: number }>(sql`
        select ${dayText(localDayOf(sql`p.created_at`))} as day, p.signup_source as source, p.signup_referrer as referrer, count(*)::int as n
        from ${people} where ${since(sql`p.created_at`, prevFrom)}
        group by 1, 2, 3`),
    activity(today, from, activityFrom, cohortFrom),
    rows<{ kind: ActionKind; day: string; n: number }>(sql`
        select kind, ${dayText(sql`day`)} as day, count(*)::int as n from (
          select 'cards' as kind, ${localDayOf(sql`x.created_at`)} as day
            from public.card_reviews x join ${people} on p.user_id = x.user_id
            where x.outcome in (${activating}) and ${since(sql`x.created_at`, from)}
          union all select 'missions', ${localDayOf(sql`x.done_at`)}
            from public.missions x join ${people} on p.user_id = x.user_id
            where x.status = 'done' and not x.is_extra and ${since(sql`x.done_at`, from)}
          union all select 'lessons', ${localDayOf(sql`x.opened_at`)}
            from public.topic_opens x join ${people} on p.user_id = x.user_id
            where ${since(sql`x.opened_at`, from)}
          union all select 'coach', ${localDayOf(sql`x.created_at`)}
            from public.coach_messages x join ${people} on p.user_id = x.user_id
            where x.role = 'user' and ${since(sql`x.created_at`, from)}
          union all select 'mocks', ${localDayOf(sql`x.started_at`)}
            from public.mocks x join ${people} on p.user_id = x.user_id
            where ${since(sql`x.started_at`, from)}
        ) a group by 1, 2`),
    rows<{ area: string | null; correct: number; wrong: number }>(sql`
        select coalesce(tp.domain, case when c.problem_slug is not null then 'dsa' end) as area,
               (count(*) filter (where cr.outcome = 'correct'))::int as correct,
               (count(*) filter (where cr.outcome = 'wrong'))::int as wrong
        from public.card_reviews cr join ${people} on p.user_id = cr.user_id
        join public.cards c on c.id = cr.card_id left join public.topics tp on tp.slug = c.topic_slug
        where cr.outcome in (${activating}) and ${since(sql`cr.created_at`, from)}
        group by 1`),
    // Sums stay bigint (a string from the driver, read with Number()): a bad row can skew a number, never
    // overflow an int cast and take the page down.
    rows<{ opened: number; shared: string | number; views: string | number; reopens: string | number }>(sql`
        select
          (select count(*) from public.share_codes x join ${people} on p.user_id = x.user_id where ${since(sql`x.created_at`, from)})::int as opened,
          (select coalesce(sum(x.shared_count::bigint), 0) from public.share_codes x where ${counted("x")})::bigint as shared,
          (select coalesce(sum(x.views::bigint), 0) from public.share_codes x where ${counted("x")})::bigint as views,
          (select coalesce(sum(x.open_count::bigint - 1), 0) from public.topic_opens x join ${people} on p.user_id = x.user_id
            where x.last_opened_at is not null and ${since(sql`x.last_opened_at`, from)})::bigint as reopens`),
    rows<{ email: string | null; n: number }>(sql`
        select su.email, count(*)::int as n
        from ${people} join public.share_codes sc on sc.code = p.signup_campaign join auth.users su on su.id = sc.user_id
        where p.signup_source = 'share' and ${since(sql`p.created_at`, from)} and ${counted("sc")}
        group by su.id, su.email order by n desc, su.email limit 5`),
    rows<{ day: string; readers: number; total: number }>(sql`
        select to_char(u.created_at at time zone 'utc', 'YYYY-MM-DD') as day,
               coalesce(sum(u.cost_usd) filter (where ${counted("u")}), 0)::float8 as readers,
               coalesce(sum(u.cost_usd), 0)::float8 as total
        from public.ai_usage u where u.created_at >= (${spendFrom}::date::timestamp at time zone 'utc') group by 1`),
    rows<{ total: number; open: number; latest: { at: string; message: string; open: boolean }[] | null }>(sql`
        select
          (select count(*) from public.problem_reports x join ${people} on p.user_id = x.user_id where ${since(sql`x.created_at`, from)})::int as total,
          (select count(*) from public.problem_reports x join ${people} on p.user_id = x.user_id where x.resolved_at is null)::int as open,
          (select json_agg(r) from (
            select x.created_at as at, left(x.message, 140) as message, x.resolved_at is null as open
            from public.problem_reports x join ${people} on p.user_id = x.user_id
            where ${since(sql`x.created_at`, from)} order by x.created_at desc limit 3
          ) r) as latest`),
    rows<{
      last_seen: string;
      email: string | null;
      source: string | null;
      referrer: string | null;
      day_n: number | null;
      length: number | null;
      answers: number;
    }>(sql`
        with ${activeDays(t(activityFrom))},
        last as (
          select r.user_id, max(r.ts) as ts from raw r join ${people} on p.user_id = r.user_id
          group by r.user_id order by 2 desc limit ${PEOPLE}
        )
        select l.ts as last_seen, au.email, p.signup_source as source, p.signup_referrer as referrer,
               (${localDayOf(sql`now()`)} - c.start_date + 1) as day_n, c.length_days as length,
               (select count(*) from public.card_reviews cr where cr.user_id = l.user_id
                  and cr.outcome in (${activating}) and cr.created_at >= now() - interval '7 days')::int as answers
        from last l join ${people} on p.user_id = l.user_id
        left join lateral (
          select start_date, length_days from public.campaigns c
          where c.user_id = l.user_id and c.status = 'active' order by c.created_at desc limit 1
        ) c on true
        order by l.ts desc`),
    readSpend(null, now),
    settings.launchDate ? launchGateCounts(settings.launchDate) : Promise.resolve(null),
    // Visitors have no timezone, so the window is plain UTC days.
    rows<DemoEvent>(sql`select visit, kind, data from public.try_events where created_at >= ${from}::date`).catch((e) => {
      // A missing or slow table empties only the demo section, never the whole page.
      logError("analytics: demo query failed", e);
      return [] as DemoEvent[];
    }),
    rows<{ n: number }>(sql`
        select count(*)::int as n from ${people} where p.signup_spot = 'try' and ${since(sql`p.created_at`, from)}`),
  ]);

  const signupsAll = fillDays(
    signupRows.map((r) => ({ day: r.day, n: Number(r.n) })).filter((r) => r.day >= prevFrom),
    windowDays(range * 2, today),
  );
  const groups: Record<SourceGroup, number> = { linkedin: 0, share: 0, other: 0, direct: 0, unknown: 0 };
  for (const r of signupRows) if (r.day >= from) groups[sourceGroup(r.source, r.referrer)] += Number(r.n);
  const signupsDaily = signupsAll.slice(range);

  const dailyAll = fillDays(act?.daily ?? [], windowDays(Math.max(range, 14), today));
  const weekly = weeklySeries(act?.weeks ?? [], WEEKS);
  const byKind = (kind: ActionKind) =>
    fillDays(
      actionRows.filter((r) => r.kind === kind).map((r) => ({ day: r.day, n: Number(r.n) })),
      days,
    );
  const f = act?.funnel;
  const costByDay = new Map(costRows.map((r) => [r.day, r]));
  const costDays = windowDays(Math.max(range, 30), utcToday);
  const cost = costDays.map((day) => {
    const r = costByDay.get(day);
    const readers = Number(r?.readers ?? 0);
    return { day, readers, builds: Math.max(0, Number(r?.total ?? 0) - readers) };
  });

  return {
    version: ANALYTICS_VERSION,
    range,
    today,
    generatedAt: now.toISOString(),
    launchDate: settings.launchDate,
    here: {
      today: Number(act?.today ?? 0),
      lastWeekSoFar: Number(act?.last_week ?? 0),
      daily14: dailyAll.slice(-14).map((d) => d.n),
      wau: weekly[WEEKS - 1]!,
      wauPrev: weekly[WEEKS - 2]!,
      weekly,
      signups: sum(signupsDaily),
      signupsPrev: sum(signupsAll.slice(0, range)),
      signupsDaily,
    },
    actives: dailyAll.slice(-range),
    activeUsers: Number(act?.in_range ?? 0),
    cohorts: (act?.cohorts ?? []).map((c) => ({ week: c.week, size: Number(c.size), back: [Number(c.w2), Number(c.w3), Number(c.w4)] })),
    gate: settings.launchDate && gateCounts ? { launchDate: settings.launchDate, ...gateCounts } : null,
    actions: Object.fromEntries(ACTION_KINDS.map((k) => [k, byKind(k)])) as Record<ActionKind, DayCount[]>,
    reopens: Number(share?.reopens ?? 0),
    funnel: {
      signedUp: Number(f?.signed_up ?? 0),
      setup: Number(f?.setup ?? 0),
      answered: Number(f?.answered ?? 0),
      finished: Number(f?.finished ?? 0),
      oldEnough: Number(f?.old_enough ?? 0),
      cameBack: Number(f?.came_back ?? 0),
    },
    areas: foldAreas(areaRows.map((r) => ({ area: r.area, correct: Number(r.correct), wrong: Number(r.wrong) }))),
    sources: (["linkedin", "share", "other", "direct", "unknown"] as const).map((group) => ({ group, n: groups[group] })),
    share: {
      opened: Number(share?.opened ?? 0),
      invites: groups.share,
      shared: Number(share?.shared ?? 0),
      views: Number(share?.views ?? 0),
      sharers: sharerRows.map((r) => ({ who: maskEmail(r.email), n: Number(r.n) })),
    },
    cost: {
      daily: cost.slice(-range),
      dailyCap: settings.aiDailyCapUsd,
      lifetime: spend.lifetime,
      cap: settings.aiLifetimeCapUsd,
      last30: cost.slice(-30).reduce((s, d) => s + d.readers + d.builds, 0),
    },
    reports: {
      total: Number(reports?.total ?? 0),
      open: Number(reports?.open ?? 0),
      latest: (reports?.latest ?? []).map((r) => ({ at: String(r.at), message: r.message, open: r.open })),
    },
    people: peopleRows.map((r) => ({
      who: maskEmail(r.email),
      lastSeenAt: new Date(r.last_seen).toISOString(),
      dayN: r.day_n === null ? null : Number(r.day_n),
      length: r.length === null ? null : Number(r.length),
      answers7: Number(r.answers),
      source: sourceGroup(r.source, r.referrer),
    })),
    demo: { ...demoFunnel(demoRows), signups: Number(demoSignups?.n ?? 0) },
  };
}

/** The dashboard for one range, from Redis when computed in the last few minutes. A Redis outage only
 *  costs the speed-up: the numbers are then computed straight from the tables. */
export async function analytics(range: Range, timezone: string): Promise<Analytics> {
  const settings = await getSettings();
  // The launch date is part of the key, and a hit must carry the same date, so changing it never serves
  // the old gate. The payload version is part of both too, so an older shape is never read.
  const k = analyticsCacheKey(range, settings.launchDate, timezone);
  try {
    const hit = await redis().get<Analytics>(k);
    if (isCachedFor(hit, range, settings.launchDate)) return hit;
  } catch (e) {
    logError("analytics cache unreadable", e);
  }
  const fresh = await compute(range, new Date(), settings, timezone);
  try {
    await redis().set(k, JSON.stringify(fresh), { ex: CACHE_SECONDS });
  } catch (e) {
    logError("analytics cache not written", e);
  }
  return fresh;
}

/** Computes without the cache; the database check script runs every query through this. */
export const computeAnalytics = compute;
