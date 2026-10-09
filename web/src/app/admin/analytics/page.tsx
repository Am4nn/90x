import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { type ActionKind, analytics } from "@/lib/admin/analytics";
import {
  type AreaKey,
  dayMonth,
  dropOff,
  GATE_DAYS,
  GATE_TARGET,
  MIN_GROUP_FOR_PCT,
  lastSeen,
  monthsToCeiling,
  parseRange,
  pct,
  RANGES,
  safeZone,
  shortDate,
} from "@/lib/admin/analytics-math";
import {
  actionsCaption,
  areasCaption,
  changeWords,
  cohortCaption,
  dauCaption,
  demoCaption,
  funnelCaption,
  glance,
  lifetimeCaption,
  peopleCaption,
  reportsCaption,
  shareCaption,
  sourcesCaption,
  spendCaption,
} from "@/lib/admin/analytics-words";
import type { SourceGroup } from "@/lib/analytics/source";
import { requireAdmin } from "@/lib/auth/viewer";
import { addDays, DAY_NAMES_LONG, weekday } from "@/lib/tracker/dates";
import { timezoneOf } from "@/lib/tracker/service";
import { TRY_STEPS, type TryStep } from "@/lib/try/steps";
import { AdminNav, backToApp } from "../admin-nav";
import {
  Card,
  CohortGrid,
  CohortLegend,
  Empty,
  LineChart,
  Meter,
  MiniBars,
  NumbersByDay,
  Section,
  SpendBars,
  Stat,
  Tile,
  Track,
} from "./charts";
import { JobsSection } from "./jobs-section";
import { LaunchGatePanel } from "./launch-gate";

export const metadata: Metadata = { title: "Analytics" };

const usd = (n: number) => `$${n.toFixed(2)}`;
const SOURCE_NAMES: Record<SourceGroup, string> = {
  linkedin: "LinkedIn",
  share: "Invite links",
  other: "Other referrers",
  direct: "Direct",
  unknown: "Unknown (before tracking)",
};
const SOURCE_SHORT: Record<SourceGroup, string> = {
  linkedin: "LinkedIn",
  share: "Invite",
  other: "Other",
  direct: "Direct",
  unknown: "Unknown",
};
const KINDS: { k: ActionKind; name: string; sub: string; unit: string }[] = [
  { k: "cards", name: "Cards answered", sub: "in the Feed", unit: "cards" },
  { k: "missions", name: "Missions done", sub: "on Today", unit: "missions" },
  { k: "lessons", name: "Lessons opened", sub: "first open of a topic", unit: "first opens" },
  { k: "coach", name: "Coach messages", sub: "sent by readers", unit: "messages" },
  { k: "mocks", name: "Mock interviews", sub: "started", unit: "mocks" },
];
// Literal class names, so Tailwind keeps them: one per area, colour never alone (each row is named).
const AREA_FILL: Record<AreaKey, string> = {
  dsa: "fill-topic-dsa",
  system_design: "fill-topic-sd",
  java: "fill-topic-java",
  sql: "fill-topic-sql",
  cs: "fill-topic-cs",
  other: "fill-mute-2",
};
const AREA_DOT: Record<AreaKey, string> = {
  dsa: "bg-topic-dsa",
  system_design: "bg-topic-sd",
  java: "bg-topic-java",
  sql: "bg-topic-sql",
  cs: "bg-topic-cs",
  other: "bg-mute-2",
};
const JUMPS = [
  ["here", "Anyone here?"],
  ["back", "Coming back?"],
  ["do", "What they do"],
  ["study", "What they study"],
  ["from", "Where from"],
  ["cost", "Cost and health"],
  ["people", "People"],
  ["demo", "The demo"],
  ["jobs", "Scheduled jobs"],
] as const;
const STEP_NAMES: Record<TryStep, string> = {
  viewed: "Only looked",
  answered: "Answered a card",
  listened: "Listened to the lesson",
  signed_in: "Pressed sign in",
};
const CARD_NAMES = { sd: "System design card", dsa: "DSA card", sql: "SQL card" } as const;
/** Time on page, from a bucket midpoint. */
const onPage = (s: number | null) => (s === null ? "-" : s < 60 ? `${s} sec` : `${Math.round(s / 60)} min`);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const row = "grid gap-3 md:grid-cols-2 md:items-start";

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const viewer = await requireAdmin();
  const range = parseRange((await searchParams).range);
  // Resolved once: the formatter below throws on an empty or unknown zone, and it is part of the cache key.
  const tz = safeZone(await timezoneOf(viewer.id));
  const a = await analytics(range, tz);
  const now = new Date(a.generatedAt);
  const per = range === 7 ? "the week before" : `the ${range} days before`;
  const launchInRange = a.launchDate && a.actives.some((d) => d.day === a.launchDate) ? a.launchDate : null;
  const funnel = dropOff(a.funnel);
  const kindTotals = Object.fromEntries(KINDS.map((k) => [k.k, { name: k.name, n: sum(a.actions[k.k].map((d) => d.n)) }]));
  const sources = a.sources.map((s) => ({ name: SOURCE_NAMES[s.group], n: s.n }));
  const sourceMax = Math.max(1, ...sources.map((s) => s.n));
  const sourceTotal = sum(sources.map((s) => s.n));
  const areaMax = Math.max(1, ...a.areas.map((r) => r.n));
  const months = monthsToCeiling(a.cost.lifetime, a.cost.cap, a.cost.last30);
  const updated = new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(now);
  const leak =
    funnel.showPct && funnel.worst !== null ? `people who stop before "${funnel.steps[funnel.worst]!.name.toLowerCase()}"` : null;
  const lines = glance({
    wau: a.here.wau,
    wauPrev: a.here.wauPrev,
    signups: a.here.signups,
    range,
    gate: a.gate ? { returners: a.gate.returners, target: GATE_TARGET, by: addDays(a.gate.launchDate, GATE_DAYS - 1) } : null,
    leak,
    lifetime: a.cost.lifetime,
    cap: a.cost.cap,
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-6">
      <div className="flex flex-col gap-4">
        <PageHeader title="Analytics" action={backToApp} />
        <AdminNav current="Analytics" />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <nav aria-label="Range" className="grid w-full grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1 sm:w-96">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/admin/analytics?range=${r}`}
                aria-current={r === range ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-center text-small font-semibold ${r === range ? "bg-surface-2 text-text" : "text-mute hover:text-text-2"}`}
              >
                {r} days
              </Link>
            ))}
          </nav>
          <p className="text-small text-mute">
            {shortDate(a.today)} {a.today.slice(0, 4)} &middot; updated <b className="tabular font-semibold text-text-2">{updated}</b>,
            refreshes every 5 min
          </p>
        </div>
        <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface px-5 py-4">
          <span className="text-tag font-bold tracking-eyebrow text-mute uppercase">At a glance</span>
          <p className="max-w-prose text-body text-text-2">{lines.join(" ")}</p>
        </div>
        <nav aria-label="Jump to" className="flex flex-wrap gap-1.5">
          {JUMPS.map(([id, name]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-full border border-line-2 px-3 py-2 text-tag font-bold text-text-2 hover:text-text"
            >
              {name}
            </a>
          ))}
        </nav>
      </div>

      <Section
        n={1}
        id="here"
        title="Is anyone here?"
        hint="active = did anything real: answered, messaged the coach, logged a problem, reviewed, ran a mock"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Tile
            label="Active today, so far"
            value={a.here.today}
            spark={a.here.daily14}
            sparkLabel="last 14 days"
            change={changeWords(a.here.today, a.here.lastWeekSoFar, `last ${DAY_NAMES_LONG[weekday(a.today)]}`)}
            before={a.here.lastWeekSoFar}
          />
          <Tile
            label="Active in the last 7 days"
            value={a.here.wau}
            spark={a.here.weekly}
            sparkLabel="last 8 weeks"
            change={changeWords(a.here.wau, a.here.wauPrev, "the 7 days before")}
            before={a.here.wauPrev}
          />
          <Tile
            label={`New sign-ups, last ${range} days`}
            value={a.here.signups}
            spark={a.here.signupsDaily.map((d) => d.n)}
            sparkLabel="per day"
            change={changeWords(a.here.signups, a.here.signupsPrev, per)}
            before={a.here.signupsPrev}
          />
        </div>
      </Section>

      <Section n={2} id="back" title="Are they coming back?">
        <Card title="People active each day" caption={dauCaption(a.actives, a.launchDate)}>
          <LineChart
            data={a.actives}
            marker={launchInRange ? { day: launchInRange, label: "Launch post" } : undefined}
            label="People active each day"
            unit={["person", "people"]}
          />
          <NumbersByDay
            caption="People active each day"
            columns={["People"]}
            rows={a.actives.map((d) => ({ day: d.day, values: [d.n] }))}
          />
        </Card>
        <div className={row}>
          <Card
            title="Did each sign-up week come back?"
            className={a.gate ? "" : "md:col-span-2"}
            caption={cohortCaption(a.cohorts, a.today)}
            note="Week 1 is the week someone joined (Mon to Sun). Always the last six sign-up weeks, whatever the range."
          >
            {a.cohorts.length === 0 ? (
              <Empty title="No sign-ups in the last six weeks">Rows appear with the first sign-up.</Empty>
            ) : (
              <>
                <CohortGrid cohorts={a.cohorts} today={a.today} />
                <CohortLegend />
              </>
            )}
          </Card>
          {a.gate && <LaunchGatePanel counts={a.gate} today={a.today} />}
        </div>
      </Section>

      <Section n={3} id="do" title="What do they do?">
        <div className={row}>
          <Card
            title="Actions per day, by kind"
            caption={actionsCaption(kindTotals, sum(a.actives.map((d) => d.n)), range)}
            note={
              <>
                Each row has its own scale: compare shapes, not heights. Brighter bar = today, so far.{" "}
                {a.reopens > 0 && `Re-opens on lessons last opened in this range: about ${a.reopens}, on top of the first opens.`}
              </>
            }
          >
            {KINDS.every((k) => kindTotals[k.k]!.n === 0) ? (
              <Empty title={`Nothing yet in ${range} days`}>
                No cards, missions, coach messages, mocks or lessons. The rows come back with the first action.
              </Empty>
            ) : (
              <ul className="flex flex-col">
                {KINDS.map((k, i) => {
                  const total = kindTotals[k.k]!.n;
                  const when = a.actions[k.k].filter((d) => d.n > 0).map((d) => dayMonth(d.day));
                  return (
                    <li
                      key={k.k}
                      className={`grid grid-cols-[1fr_auto] items-center gap-x-3.5 gap-y-1.5 py-2.5 md:grid-cols-[9rem_1fr_4rem] ${i ? "border-t border-line" : "pt-0.5"}`}
                    >
                      <span className="text-small leading-tight font-semibold">
                        {k.name}
                        <span className="block text-tag font-medium text-mute">{k.sub}</span>
                      </span>
                      <span className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:row-start-auto">
                        {total < 3 ? (
                          <span className="block rounded-lg border border-dashed border-line-2 px-2.5 py-2 text-tag leading-label text-text-2">
                            {total === 0
                              ? `None in ${range} days.`
                              : `Only ${total} in ${range} days (${when.join(", ")}). Too few to chart.`}
                          </span>
                        ) : (
                          <MiniBars data={a.actions[k.k]} label={`${k.name} per day`} unit={k.unit} />
                        )}
                      </span>
                      <span className="tabular col-start-2 row-start-1 text-right font-display text-heading font-semibold md:col-start-3">
                        {total}
                        <span className="block font-sans text-tag font-medium text-mute">total</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {KINDS.some((k) => kindTotals[k.k]!.n > 0) && (
              <NumbersByDay
                caption="Actions per day, by kind"
                columns={KINDS.map((k) => k.name)}
                rows={a.actives.map((d, i) => ({ day: d.day, values: KINDS.map((k) => a.actions[k.k][i]!.n) }))}
              />
            )}
          </Card>
          <Card
            title="Where people drop off"
            caption={funnelCaption(funnel.steps, funnel.worst, funnel.showPct, range)}
            note="People who signed up in this range. The last step only counts people who joined 7+ days ago."
          >
            <ol className="flex flex-col gap-3">
              {funnel.steps.map((s, i) => {
                const last = i === funnel.steps.length - 1;
                const right =
                  s.n === null
                    ? ""
                    : !funnel.showPct || i === 0
                      ? `${s.n}`
                      : last
                        ? `${s.n} of ${s.of} old enough`
                        : `${s.n} · ${s.pct ?? 0}% of step before`;
                return (
                  <li key={s.name} className="flex flex-col gap-1.5">
                    <span className="tabular flex items-baseline justify-between gap-3 text-small">
                      <span className="text-text">{s.name}</span>
                      <span className="text-text-2">{right}</span>
                    </span>
                    {s.n === null ? (
                      <span className="rounded-md border border-dashed border-line-2 px-2 py-0.5 text-tag text-mute">
                        not yet: everyone here joined under 7 days ago
                      </span>
                    ) : (
                      <Track value={s.n} max={last ? (s.of ?? 0) : (funnel.steps[0]!.n ?? 0)} />
                    )}
                    {i === funnel.worst && funnel.showPct && (
                      <span className="text-tag font-bold text-warn">▼ biggest drop: −{(funnel.steps[i - 1]!.n ?? 0) - (s.n ?? 0)}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      </Section>

      <Section n={4} id="study" title="What do they study?" hint='Feed answers, right or wrong; skips and "New to me" left out'>
        <Card title="Answers and accuracy by area" caption={areasCaption(a.areas, range)}>
          {a.areas.length === 0 ? (
            <Empty title={`No answers yet in ${range} days`}>Areas show up with the first answered card.</Empty>
          ) : (
            <div className="flex flex-col gap-2">
              <div aria-hidden="true" className="flex justify-between text-tag text-mute">
                <span>Answers</span>
                <span>Answered right</span>
              </div>
              <ul className="tabular flex flex-col gap-2.5 text-small">
                {a.areas.map((r) => (
                  <li key={r.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[13rem_1fr_9rem]">
                    <span className="flex items-center gap-2 text-text">
                      <i aria-hidden="true" className={`inline-block size-2 rounded-full ${AREA_DOT[r.key]}`} />
                      {r.label}
                    </span>
                    <span className="col-span-2 row-start-2 flex items-center gap-2 md:col-span-1 md:row-start-auto">
                      <span className="min-w-0 flex-1">
                        <Track value={r.n} max={areaMax} fill={AREA_FILL[r.key]} />
                      </span>
                      <span className="w-20 text-text-2">
                        {r.n} <span className="sr-only">answers,</span>
                      </span>
                    </span>
                    <span className="col-start-2 row-start-1 flex items-center justify-end gap-2 md:col-start-3">
                      <span className="hidden w-20 md:block">
                        <Track value={r.pct ?? 0} max={100} fill="fill-text-2" thin />
                      </span>
                      <b className="font-bold text-text">
                        {r.pct === null ? "–" : `${r.pct}%`}
                        <span className="sr-only"> right</span>
                      </b>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </Section>

      <Section n={5} id="from" title="Where do they come from?">
        <div className={row}>
          <Card title="Sign-ups by source" caption={sourcesCaption(sources, a.share.invites, range)}>
            <ul className="flex flex-col gap-3">
              {sources.map((s) => (
                <li key={s.name} className="flex flex-col gap-1.5">
                  <span className="tabular flex items-baseline justify-between gap-3 text-small">
                    <span className="text-text">{s.name}</span>
                    <span className="text-text-2">
                      {s.n}
                      {sourceTotal >= MIN_GROUP_FOR_PCT && ` · ${Math.round((s.n / sourceTotal) * 100)}%`}
                    </span>
                  </span>
                  <Track value={s.n} max={sourceMax} />
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Share card and invite links" caption={shareCaption(a.share.opened, a.share.invites, range)}>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                [a.share.opened, `people made their share card, last ${range} days`],
                [a.share.invites, "sign-ups through someone's invite link"],
                [a.share.shared, "times a card was shared, copied or downloaded (since tracking began)"],
                [a.share.views, "card image loads that reached the server, since tracking began (a floor: most are served from cache)"],
              ].map(([v, l]) => (
                <div key={String(l)} className="rounded-lg border border-line bg-background px-3 py-2.5">
                  <div className="tabular font-display text-title font-bold">{v}</div>
                  <div className="text-tag leading-label text-mute">{l}</div>
                </div>
              ))}
            </div>
            <h4 className="mt-1 text-small font-medium text-mute">Who brought people in</h4>
            {a.share.sharers.length === 0 ? (
              <p className="text-small text-text-2">Nobody joined through an invite link in these {range} days.</p>
            ) : (
              <ul className="tabular flex flex-col">
                {a.share.sharers.map((s, i) => (
                  <li
                    key={`${s.who}-${i}`}
                    className={`flex justify-between gap-3 py-1.5 text-small text-text-2 ${i ? "border-t border-line" : ""}`}
                  >
                    <span>{s.who}</span>
                    <b className="font-semibold text-text">
                      {s.n} sign-up{s.n === 1 ? "" : "s"}
                    </b>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </Section>

      <Section n={6} id="cost" title="Cost and health" hint="AI spend in UTC days, all of it (yours too)">
        <div className={row}>
          <Card title="AI spend per day" caption={spendCaption(a.cost.daily, a.activeUsers, a.cost.dailyCap, range)}>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-tag text-text-2">
              <span className="inline-flex items-center gap-1.5">
                <i aria-hidden="true" className="inline-block size-2.5 rounded-sm bg-cyan" />
                Readers (Feed grading, coach)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i aria-hidden="true" className="inline-block size-2.5 rounded-sm bg-mute-2" />
                System jobs and admins
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i aria-hidden="true" className="inline-block w-4 border-t-2 border-dashed border-mute" />
                Daily cap {usd(a.cost.dailyCap)}
              </span>
            </div>
            <SpendBars data={a.cost.daily} cap={a.cost.dailyCap} label="AI spend per day" />
            <NumbersByDay
              caption="AI spend per UTC day: readers and system jobs"
              columns={["Readers", "System jobs and admins"]}
              rows={a.cost.daily.map((d) => ({ day: d.day, values: [usd(d.readers), usd(d.builds)] }))}
            />
          </Card>
          <div className="flex min-w-0 flex-col gap-3">
            <Card title="Lifetime AI spend" caption={lifetimeCaption(a.cost.lifetime, a.cost.cap, months)}>
              <Meter
                label={`Against the ${usd(a.cost.cap)} ceiling`}
                value={a.cost.lifetime}
                max={a.cost.cap}
                text={`${usd(a.cost.lifetime)} of ${usd(a.cost.cap)}`}
              />
            </Card>
            <Card title="Problem reports" caption={reportsCaption(a.reports.total, a.reports.open, range)}>
              <div className="flex items-end justify-between gap-3">
                <span>
                  <span className="tabular font-display text-display font-bold">{a.reports.total}</span>{" "}
                  <span className="text-small text-mute">in {range} days</span>
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-tag font-semibold ${a.reports.open ? "border-warn/35 bg-warn/10 text-warn" : "border-ok/35 bg-ok/10 text-ok"}`}
                >
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                  {a.reports.open ? `${a.reports.open} still open` : "none open"}
                </span>
              </div>
              {a.reports.latest.length > 0 && (
                <ul className="flex flex-col">
                  {a.reports.latest.map((r, i) => (
                    <li
                      key={`${r.at}-${i}`}
                      className={`flex justify-between gap-3 py-1.5 text-small text-text-2 ${i ? "border-t border-line" : ""}`}
                    >
                      <span className="min-w-0 wrap-anywhere">{r.message}</span>
                      <b className="font-semibold whitespace-nowrap text-text">
                        {r.open ? "open" : "fixed"} · {lastSeen(r.at, now, tz)}
                      </b>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/admin/reports" className="text-small text-text-2 underline underline-offset-2">
                All reports
              </Link>
            </Card>
          </div>
        </div>
      </Section>

      <Section n={7} id="people" title="People" hint="20 most recently active · emails partly hidden">
        <Card caption={peopleCaption(a.people)}>
          {a.people.length === 0 ? (
            <Empty title="Nobody active yet">The list fills with the first reader who does something real.</Empty>
          ) : (
            <table className="tabular w-full text-small">
              <caption className="sr-only">The 20 most recently active people</caption>
              <thead className="max-md:sr-only">
                <tr className="text-left text-mute">
                  <th scope="col" className="border-b border-line px-2 py-1.5 font-medium">
                    Who
                  </th>
                  <th scope="col" className="border-b border-line px-2 py-1.5 font-medium">
                    Last seen
                  </th>
                  <th scope="col" className="border-b border-line px-2 py-1.5 font-medium">
                    Campaign
                  </th>
                  <th scope="col" className="border-b border-line px-2 py-1.5 text-right font-medium">
                    Answers this week
                  </th>
                  <th scope="col" className="border-b border-line px-2 py-1.5 font-medium">
                    Came from
                  </th>
                </tr>
              </thead>
              <tbody>
                {a.people.map((p, i) => {
                  const day = p.dayN !== null && p.length ? Math.min(p.dayN, p.length) : null;
                  return (
                    <tr
                      key={`${p.who}-${i}`}
                      className="border-b border-line text-text-2 last:border-b-0 max-md:grid max-md:grid-cols-[auto_1fr_auto] max-md:items-center max-md:gap-x-2.5 max-md:gap-y-1 max-md:py-2.5"
                    >
                      <td className="px-2 py-2 font-semibold text-text max-md:col-span-2 max-md:p-0">{p.who}</td>
                      <td className="px-2 py-2 whitespace-nowrap max-md:col-start-3 max-md:row-start-1 max-md:p-0 max-md:text-right">
                        {lastSeen(p.lastSeenAt, now, tz)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap max-md:p-0">
                        {day === null ? (
                          <span className="text-mute">no campaign yet</span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            Day {day} of {p.length}
                            <span className="hidden w-14 md:block">
                              <Track value={day} max={p.length!} thin />
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right max-md:col-start-3 max-md:row-start-2 max-md:p-0">
                        {p.answers7}
                        <span className="text-mute md:hidden"> this week</span>
                      </td>
                      <td className="px-2 py-2 max-md:col-start-2 max-md:row-start-2 max-md:p-0">
                        <span className="rounded-full border border-line-2 px-2 py-0.5 text-tag text-text-2">{SOURCE_SHORT[p.source]}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </Section>

      <Section n={8} id="demo" title="The demo (/try)" hint="signed-out visitors; a random id per visit, no cookie">
        <Card caption={demoCaption(a.demo)}>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
            <Stat title="Visits" value={String(a.demo.visits)} />
            <Stat
              title="Answered 1 / 2 / 3 cards"
              value={a.demo.answered
                .map((n) => (a.demo.visits >= MIN_GROUP_FOR_PCT ? `${n} (${pct(n, a.demo.visits)}%)` : String(n)))
                .join(" / ")}
              detail={`visits that answered at least that many different cards${a.demo.visits >= MIN_GROUP_FOR_PCT ? ", and their share of visits" : ""}`}
            />
            <Stat
              title="Listened / finished"
              value={`${a.demo.listens.started} / ${a.demo.listens.finished}`}
              detail="started the lesson / heard 95%"
            />
            <Stat title="Sign-in clicks" value={String(a.demo.signinClicks)} detail="visits that pressed sign in" />
            <Stat title="Sign-ups from /try" value={String(a.demo.signups)} detail="new accounts whose sign-in button was on the demo" />
            <Stat title="Median time on page" value={onPage(a.demo.medianSeconds)} detail="from visits that left; rounded to a bucket" />
          </div>
          {a.demo.visits === 0 ? (
            <Empty title="No visits yet">The numbers appear once someone opens /try without signing in.</Empty>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <h4 className="text-small font-medium text-mute">Furthest step reached</h4>
                <ul className="tabular flex flex-col gap-2">
                  {TRY_STEPS.map((step) => (
                    <li key={step} className="flex flex-col gap-1 text-small text-text-2">
                      <span className="flex justify-between gap-3">
                        <span>{STEP_NAMES[step]}</span>
                        <b className="font-semibold text-text">{a.demo.leaveSteps[step]}</b>
                      </span>
                      <Track value={a.demo.leaveSteps[step]} max={a.demo.visits} />
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-2">
                <h4 className="text-small font-medium text-mute">Right on the first try</h4>
                <ul className="tabular flex flex-col">
                  {(["sd", "dsa", "sql"] as const).map((card, i) => {
                    const r = a.demo.correct[card];
                    return (
                      <li
                        key={card}
                        className={`flex justify-between gap-3 py-1.5 text-small text-text-2 ${i ? "border-t border-line" : ""}`}
                      >
                        <span>{CARD_NAMES[card]}</span>
                        <b className="font-semibold text-text">
                          {r.whole === 0
                            ? "no answers"
                            : `${r.part} of ${r.whole}${r.whole >= MIN_GROUP_FOR_PCT ? ` (${pct(r.part, r.whole)}%)` : ""}`}
                        </b>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </Card>
      </Section>

      <JobsSection />

      <p className="text-small text-mute">
        Numbers leave out <b className="font-semibold text-text-2">admins</b> and <b className="font-semibold text-text-2">test accounts</b>{" "}
        (@e2e.test). Days are each person&apos;s own calendar day, and today is yours; AI spend uses UTC days. Counts come first because the
        groups are small.
      </p>
    </main>
  );
}
