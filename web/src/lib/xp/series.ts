import { addDays } from "@/lib/tracker/dates";

export type XpDay = { date: string; xp: number };

/** The seven local days ending `today`, oldest first, with 0 for a day that earned nothing. */
export function weekSeries(rows: { day: string; xp: number }[], today: string): XpDay[] {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.day, (by.get(r.day) ?? 0) + r.xp);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, xp: by.get(date) ?? 0 };
  });
}
