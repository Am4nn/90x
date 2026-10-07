import { addDays, daysBetween, localDate } from "@/lib/tracker/dates";
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

/** The Redis key of one cached dashboard: the launch date is part of it so a new date never reads the old gate. */
export const analyticsCacheKey = (range: Range, launchDate: string | null) => key("analytics", String(range), launchDate ?? "no-launch");

/** Whether a cached payload is for this range and launch date. Payloads cached before the gate existed
 *  have no `gate` field and only match when no launch date is set. */
export function isCachedFor<T extends { range: number; gate?: { launchDate: string } | null }>(
  hit: T | null | undefined,
  range: Range,
  launchDate: string | null,
): hit is T {
  return !!hit && typeof hit === "object" && hit.range === range && (hit.gate?.launchDate ?? null) === launchDate;
}
