import { weekday } from "./dates";
import { SLOT_MINUTES, type MissionType, type Slots, type Templates } from "./template";

// The first-run welcome (components/tracker/welcome.tsx) says how a day is filled:
// reviews due, then new problems, then a topic, then the 10 cards, until the day's
// time is used. Its bar draws today's template in that order, with whatever time
// the budget leaves over at the end.

/** The order the welcome lists, which is also the order Today shows a day's missions. */
const FILL_ORDER = ["review", "new_problem", "topic", "cards"] as const satisfies readonly MissionType[];

export type BarPart = { key: MissionType | "free"; minutes: number };

/** Today's minutes per mission type, in fill order, then the budget's spare minutes. Empty types are left out. */
export function dayBar(slots: Slots, budget: number | null): BarPart[] {
  const parts: BarPart[] = FILL_ORDER.map((key) => ({
    key,
    minutes: key === "cards" ? SLOT_MINUTES.cards : slots[key] * SLOT_MINUTES[key],
  })).filter((p) => p.minutes > 0);
  const used = parts.reduce((sum, p) => sum + p.minutes, 0);
  const free = budget == null ? 0 : budget - used;
  return free > 0 ? [...parts, { key: "free", minutes: free }] : parts;
}

/** What the welcome needs from the profile and the active campaign, for the day it is shown. */
export function welcomeDay(
  row: { templates: Templates; weekdayMinutes: number | null; weekendMinutes: number | null },
  today: string,
): { bar: BarPart[]; budget: number | null; everyDay: boolean } {
  const day = weekday(today);
  const budget = day === 0 || day === 6 ? row.weekendMinutes : row.weekdayMinutes;
  return { bar: dayBar(row.templates[day], budget), budget, everyDay: row.weekdayMinutes === row.weekendMinutes };
}
