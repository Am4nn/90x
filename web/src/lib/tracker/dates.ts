// Local calendar dates as "YYYY-MM-DD" strings. A user's day starts at
// midnight in their own time zone, so "today" always goes through
// localDate(tz); the rest is plain calendar math in UTC.

const parts = (tz: string, now: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
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

/** 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function weekday(date: string): Weekday {
  return toUtc(date).getUTCDay() as Weekday;
}
