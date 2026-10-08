import { weekStartOf } from "@/lib/coach/weekly-rules";
import { addDays } from "@/lib/tracker/dates";

/** `future` marks the days of the week still to come: no bar and no number yet. */
export type XpDay = { date: string; xp: number; future: boolean };

/**
 * Monday to Sunday of the week `today` falls in, with 0 for a day that earned nothing. The same week as "This week"
 * on Me and the Sunday review, so the chart's total and the card's range describe the same seven days.
 */
export function weekSeries(rows: { day: string; xp: number }[], today: string): XpDay[] {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.day, (by.get(r.day) ?? 0) + r.xp);
  const monday = weekStartOf(today);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, xp: by.get(date) ?? 0, future: date > today };
  });
}
