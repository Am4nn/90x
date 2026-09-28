// Local calendar dates as "YYYY-MM-DD" strings. A user's day starts at
// midnight in their own time zone, so "today" always goes through
// localDate(tz); the rest is plain calendar math in UTC.

const parts = (tz: string, now: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );

export function localDate(tz: string, now = new Date()): string {
  const p = parts(tz, now);
  return `${p.year}-${p.month}-${p.day}`;
}

export function localHour(tz: string, now = new Date()): number {
  return Number(parts(tz, now).hour);
}

const toUtc = (date: string) => new Date(`${date}T00:00:00Z`);

export function addDays(date: string, n: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** The instant a local calendar date begins, as an ISO string.
 *
 *  A calendar date is not an instant: 2026-09-28 starts at 18:30Z the previous
 *  day in Kolkata. Querying `createdAt >= "2026-09-28T00:00:00Z"` for a user's
 *  local Monday therefore skipped their first 5.5 hours, so the weekly review
 *  read six days and 18.5 hours of the week it claimed to cover. */
export function startOfLocalDay(tz: string, date: string): string {
  // Guess at UTC midnight, then correct by however far that lands from local
  // midnight. One correction is enough: the offset is constant across the small
  // window a guess can be wrong by, including the day a DST change falls on,
  // because the guess is never more than a day out.
  const guess = toUtc(date);
  const seen = parts(tz, guess);
  const asLocal = Date.UTC(Number(seen.year), Number(seen.month) - 1, Number(seen.day), Number(seen.hour), Number(seen.minute ?? 0));
  return new Date(guess.getTime() - (asLocal - guess.getTime())).toISOString();
}

/** 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Indexed by `Weekday`. Three files had the short list and one the long one. */
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DAY_NAMES_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function weekday(date: string): Weekday {
  return toUtc(date).getUTCDay() as Weekday;
}
