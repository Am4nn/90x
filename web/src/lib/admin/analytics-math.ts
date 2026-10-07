import { addDays, DAY_NAMES, daysBetween, localDate, weekday } from "@/lib/tracker/dates";
import { key } from "@/lib/upstash/keys";

// The arithmetic behind /admin/analytics, kept apart from the queries so the rules
// (what counts as active, when a cohort is old enough to judge) are tested with fixed data.

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];
const DEFAULT_RANGE: Range = 30;

export function parseRange(v: string | string[] | undefined): Range {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : DEFAULT_RANGE;
}

/** The `days` dates ending on `today`, oldest first. */
export function windowDays(days: number, today: string): string[] {
  return Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
}

/** One value per date in the window, 0 where the query returned nothing. */
export function fillDays(rows: { day: string; n: number }[], days: string[]): { day: string; n: number }[] {
  const by = new Map(rows.map((r) => [r.day, r.n]));
  return days.map((day) => ({ day, n: by.get(day) ?? 0 }));
}

/** A zone Intl and Postgres both accept: the given one, or UTC when it is missing or unknown. */
export function safeZone(timezone: string | null | undefined): string {
  if (!timezone) return "UTC";
  try {
    Intl.DateTimeFormat("en", { timeZone: timezone }); // throws a RangeError for a zone it does not know
    return timezone;
  } catch {
    return "UTC";
  }
}

/** The reader's calendar day for an instant, the same rule Today uses (UTC when the zone is missing or invalid). */
export function localDay(at: Date, timezone: string | null | undefined): string {
  try {
    return localDate(timezone || "UTC", at);
  } catch {
    return localDate("UTC", at);
  }
}

/** Card outcomes that are not an action: "New to me" and "Known" are declarations about a topic, not an answer.
 *  Skips count as active (the reader did something) but not as activation. */
export const DECLARATION_OUTCOMES = ["new_to_me", "known"] as const;
export const isActiveOutcome = (outcome: string) => !(DECLARATION_OUTCOMES as readonly string[]).includes(outcome);
export const ACTIVATING_OUTCOMES = ["correct", "wrong"] as const;
export const isActivatingOutcome = (outcome: string) => (ACTIVATING_OUTCOMES as readonly string[]).includes(outcome);

/** Test accounts made by the e2e suite never count. */
export const isTestEmail = (email: string | null | undefined) => (email ?? "").toLowerCase().endsWith("@e2e.test");

/** A whole-number percentage, or null when there is nothing to divide by (shown as a dash, never 0%). */
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = values.toSorted((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export type Cohort = { day: string; size: number; d1: number; d7: number };
export type Ratio = { part: number; whole: number; pct: number | null };

const ratio = (part: number, whole: number): Ratio => ({ part, whole, pct: pct(part, whole) });

/** Day-N return over the cohorts old enough to judge. Day N means active on the Nth local day after the
 *  signup day, so a cohort counts once that day has fully passed (signup day + N is before today).
 *  Younger cohorts are left out rather than counted as not returned. */
export const isMature = (cohortDay: string, n: 1 | 7, today: string) => addDays(cohortDay, n) < today;

export function returnRate(cohorts: Cohort[], n: 1 | 7, today: string): Ratio {
  let part = 0;
  let whole = 0;
  for (const c of cohorts) {
    if (!isMature(c.day, n, today)) continue;
    whole += c.size;
    part += n === 1 ? c.d1 : c.d7;
  }
  return ratio(part, whole);
}

export const activation = (activated: number, signups: number): Ratio => ratio(activated, signups);

/** Graded accuracy: correct over correct + wrong. Skips are not graded. */
export const accuracy = (correct: number, wrong: number): Ratio => ratio(correct, correct + wrong);

/** "3 of 8 (38%)": the count always comes first, because the cohorts are tiny. */
export function ratioText(r: Ratio): string {
  return r.whole === 0 ? "no data yet" : `${r.part} of ${r.whole} (${r.pct}%)`;
}

/** Stickiness: the average daily actives over the last seven days as a share of the week's actives. */
export function stickiness(lastSevenDaily: number[], weekly: number): number | null {
  if (weekly <= 0 || lastSevenDaily.length === 0) return null;
  const avg = lastSevenDaily.reduce((a, b) => a + b, 0) / 7;
  return Math.round((avg / weekly) * 100);
}

/** "42 min", "3 h 10 min", "2 d 4 h": the median time to a first answer, in a size a person reads. */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "none yet";
  const m = Math.round(minutes);
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export const GATE_DAYS = 30;
export const GATE_TARGET = 20;
/** A week-2 returner acts 7 or more days after signup, so none can exist before day 7 and pace starts there. */
export const RETURN_AFTER_DAYS = 7;

type GateState = "on-track" | "behind" | "closed-below" | "closed-met";

/** The launch gate: 20 week-2 returners within 30 days of launch. The day is whole days since the launch
 *  date (launch day is day 0, a future date also reads as day 0); the window is closed once 30 have passed.
 *  Pace is 0 until day 7, then linear to the target on day 30 and rounds up, so the gate is never green by rounding. The caller renders the gate only
 *  when a launch date is set and computes `returners` over [launch, launch + 30 days). */
export function launchGate(input: { launchDate: string; today: string; returners: number }): {
  dayOf30: number;
  returners: number;
  pace: number;
  state: GateState;
} {
  const { launchDate, today, returners } = input;
  const elapsed = daysBetween(launchDate, today);
  const dayOf30 = Math.min(GATE_DAYS, Math.max(0, elapsed));
  const pace = dayOf30 < RETURN_AFTER_DAYS ? 0 : Math.ceil((GATE_TARGET * (dayOf30 - RETURN_AFTER_DAYS)) / (GATE_DAYS - RETURN_AFTER_DAYS));
  let state: GateState;
  if (elapsed >= GATE_DAYS) state = returners >= GATE_TARGET ? "closed-met" : "closed-below";
  else state = returners < pace ? "behind" : "on-track";
  return { dayOf30, returners, pace, state };
}

/** Bumped whenever the cached payload changes shape, so a page never reads an older one. */
export const ANALYTICS_VERSION = 2;

/** The Redis key of one cached dashboard: the launch date is part of it so a new date never reads the old gate,
 *  and the viewer's time zone, which decides what "today" is. */
export const analyticsCacheKey = (range: Range, launchDate: string | null, timezone = "UTC") =>
  key("analytics", `v${ANALYTICS_VERSION}`, String(range), launchDate ?? "no-launch", timezone);

/** Whether a cached payload is this version, for this range and launch date. */
export function isCachedFor<T extends { version?: number; range: number; gate?: { launchDate: string } | null }>(
  hit: T | null | undefined,
  range: Range,
  launchDate: string | null,
): hit is T {
  return (
    !!hit &&
    typeof hit === "object" &&
    hit.version === ANALYTICS_VERSION &&
    hit.range === range &&
    (hit.gate?.launchDate ?? null) === launchDate
  );
}

/** "r••••••@gmail.com": enough to tell people apart on the admin page, never the whole address. */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "unknown";
  const at = email.lastIndexOf("@");
  const local = at < 0 ? email : email.slice(0, at);
  const dots = "•".repeat(Math.min(6, Math.max(2, local.length - 1)));
  if (at < 0) return `${local.slice(0, 1)}•••`;
  return local ? `${local.slice(0, 1)}${dots}@${email.slice(at + 1)}` : `•••@${email.slice(at + 1)}`;
}

/** The Monday of the week a date falls in (weeks run Monday to Sunday, as Postgres's date_trunc('week')). */
export function mondayOf(date: string): string {
  return addDays(date, -((weekday(date) + 6) % 7));
}

/** Weekly buckets (w = whole weeks back from today, 0 = the last 7 days) as a series, oldest first. */
export function weeklySeries(rows: { w: number; n: number }[], weeks: number): number[] {
  const out = Array.from({ length: weeks }, () => 0);
  for (const r of rows) if (r.w >= 0 && r.w < weeks) out[weeks - 1 - r.w] = r.n;
  return out;
}

/** Groups under this many people show counts only: one person is 20 points of a percentage. */
export const MIN_GROUP_FOR_PCT = 5;

export type CohortCell = { state: "not-yet" } | { state: "running" | "done"; back: number; pct: number | null };

/** One cell of the sign-up-week grid: did people who joined the week of `week` come back in week k + 1
 *  (k = 1 is the week after joining)? Not yet before that week starts, so far while it runs. */
export function cohortCell(week: string, k: 1 | 2 | 3, today: string, back: number, size: number): CohortCell {
  const start = addDays(week, 7 * k);
  if (today < start) return { state: "not-yet" };
  return { state: today <= addDays(start, 6) ? "running" : "done", back, pct: size >= MIN_GROUP_FOR_PCT ? pct(back, size) : null };
}

export type FunnelCounts = { signedUp: number; setup: number; answered: number; finished: number; oldEnough: number; cameBack: number };
export type FunnelStep = { name: string; n: number | null; pct: number | null; of?: number };

/** Sign-up to coming back, each step a subset of the one before except the last, which is over the people
 *  who joined long enough ago to have come back. `worst` is the step after the biggest drop (first four). */
export function dropOff(c: FunnelCounts): { steps: FunnelStep[]; worst: number | null; showPct: boolean } {
  const chain = [
    ["Signed up", c.signedUp],
    ["Finished setup", c.setup],
    ["Answered a first card", c.answered],
    ["Finished a first day", c.finished],
  ] as const;
  const steps: FunnelStep[] = chain.map(([name, n], i) => ({ name, n, pct: i ? pct(n, chain[i - 1]![1]) : null }));
  steps.push({ name: "Came back after 7 days", n: c.oldEnough ? c.cameBack : null, pct: pct(c.cameBack, c.oldEnough), of: c.oldEnough });
  let worst: number | null = null;
  let loss = 0;
  for (let i = 1; i < chain.length; i++) {
    const l = chain[i - 1]![1] - chain[i]![1];
    if (l > loss) [worst, loss] = [i, l];
  }
  return { steps, worst, showPct: c.signedUp >= MIN_GROUP_FOR_PCT };
}

const AREA_LABELS = {
  dsa: "DSA",
  system_design: "System design",
  java: "Java",
  sql: "SQL",
  cs: "CS core",
  other: "Other (LLD, AI, behavioural)",
} as const;
export type AreaKey = keyof typeof AREA_LABELS;
export type AreaRow = { key: AreaKey; label: string; n: number; correct: number; pct: number | null };

/** Feed answers per area in a fixed order, the small areas folded into Other, empty areas left out. */
export function foldAreas(rows: { area: string | null; correct: number; wrong: number }[]): AreaRow[] {
  const sums = new Map<AreaKey, { correct: number; wrong: number }>();
  for (const r of rows) {
    const k: AreaKey = r.area && r.area in AREA_LABELS ? (r.area as AreaKey) : "other";
    const s = sums.get(k) ?? { correct: 0, wrong: 0 };
    sums.set(k, { correct: s.correct + r.correct, wrong: s.wrong + r.wrong });
  }
  return (Object.keys(AREA_LABELS) as AreaKey[]).flatMap((k) => {
    const s = sums.get(k);
    if (!s || s.correct + s.wrong === 0) return [];
    return [{ key: k, label: AREA_LABELS[k], n: s.correct + s.wrong, correct: s.correct, pct: accuracy(s.correct, s.wrong).pct }];
  });
}

/** Months until lifetime AI spend reaches its ceiling at the last 30 days' pace: null with no recent spend. */
export function monthsToCeiling(lifetime: number, cap: number, last30: number): number | null {
  if (lifetime >= cap) return 0;
  return last30 > 0 ? (cap - lifetime) / last30 : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "Mon 26 Oct" for a calendar date. */
export function shortDate(date: string): string {
  return `${DAY_NAMES[weekday(date)]} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

/** "26 Oct": a calendar date in prose and on chart axes. */
export const dayMonth = (date: string) => shortDate(date).slice(4);

/** "12 min ago", "5 h ago", "yesterday" or "Mon 26 Oct", in the viewer's own time zone. */
export function lastSeen(at: string, now: Date, tz: string): string {
  const mins = Math.floor((now.getTime() - new Date(at).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const day = localDay(new Date(at), tz);
  const today = localDay(now, tz);
  if (day === today) return `${Math.floor(mins / 60)} h ago`;
  if (day === addDays(today, -1)) return "yesterday";
  return shortDate(day);
}
