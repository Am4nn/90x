// The overall report behind the Today block: lifetime, by area, the last seven days.
// Pure. Only graded answers count (correct or wrong); skips and declarations ("New to me", and old
// "I already know this" ones) are not answers and never move a percentage.

import { MIN_AREA_ANSWERS } from "@/lib/tracker/readiness";
import { FEED_AREAS, type FeedArea } from "./view";

export const PASS_MARK = 70;
/** An area with fewer graded answers than this is left out: one card is not a rate. Shared with Me's readiness bars. */
export { MIN_AREA_ANSWERS };

export type Tally = { answered: number; correct: number };
export type AreaRate = Tally & { area: FeedArea };
export type DayRate = Tally & { day: string };
export type OverallReport = {
  lifetime: Tally & { skipped: number };
  today: Tally;
  areas: AreaRate[];
  /** Oldest first, always seven entries ending today. */
  days: DayRate[];
};

/** Whole percent, or null when nothing was answered. */
export const percent = (tally: Tally): number | null => (tally.answered ? Math.round((tally.correct / tally.answered) * 100) : null);

/** The one sentence under Lifetime. */
export function comparisonLine(today: Tally, lifetime: Tally): string {
  const now = percent(today);
  const ever = percent(lifetime);
  if (now === null) return "No answers yet today.";
  if (ever === null) return "Today is your first day of answers.";
  const gap = now - ever;
  if (gap === 0) return `Today matches your lifetime rate of ${ever}%.`;
  const points = Math.abs(gap);
  return `Today is ${points} ${points === 1 ? "point" : "points"} ${gap > 0 ? "above" : "below"} your lifetime rate of ${ever}%.`;
}

/** Areas with enough answers to mean something, in the app's area order. */
export function visibleAreas(rows: AreaRate[]): AreaRate[] {
  return FEED_AREAS.flatMap((area) => rows.filter((r) => r.area === area && r.answered >= MIN_AREA_ANSWERS));
}

/** The seven local dates ending at `today` (YYYY-MM-DD), oldest first. */
export function lastSevenDays(today: string): string[] {
  const [y, m, d] = today.split("-").map(Number);
  const base = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return Array.from({ length: 7 }, (_, i) => new Date(base - (6 - i) * 86_400_000).toISOString().slice(0, 10));
}

/** Fills the seven days from whichever days had answers. */
export function fillDays(today: string, rows: DayRate[]): DayRate[] {
  return lastSevenDays(today).map((day) => rows.find((r) => r.day === day) ?? { day, answered: 0, correct: 0 });
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Short weekday for a YYYY-MM-DD date. */
export function weekday(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()] ?? "";
}
