import { addDays, daysBetween } from "@/lib/tracker/dates";
import type { DayStatus } from "@/lib/tracker/days";

// What the public share card may know. Deliberately small: it is the whole interface between
// a user's private rows and a public image, so nothing else can reach the picture.

export type SquareStatus = DayStatus | "future";
export type CardModel = {
  dayNumber: number;
  total: number;
  done: number;
  revived: number;
  squares: { status: SquareStatus; today: boolean }[];
};

// A campaign is 7 to 365 days (setup, "Custom"); the card keeps its true length. The clamp is only a guard.
const MAX_DAYS = 365;

// Closed days only: "pending" on a stored row never decides a square, the date does.
const closedStatus = (s: string | undefined): s is Exclude<DayStatus, "pending"> =>
  s === "done" || s === "revived" || s === "partial" || s === "missed" || s === "rest";

type Input = { startDate: string; lengthDays: number; today: string; rows: { date: string; status: string }[] };

export function buildCardModel({ startDate, lengthDays, today, rows }: Input): CardModel {
  const total = Math.max(1, Math.min(MAX_DAYS, Math.trunc(lengthDays)));
  const byDate = new Map(rows.map((r) => [r.date, r.status]));
  const dayNumber = Math.min(total, Math.max(1, daysBetween(startDate, today) + 1));
  const squares = Array.from({ length: total }, (_, i): CardModel["squares"][number] => {
    const date = addDays(startDate, i);
    const stored = byDate.get(date);
    const isToday = date === today;
    if (closedStatus(stored)) return { status: stored, today: isToday };
    if (date > today) return { status: "future", today: false };
    if (isToday) return { status: "pending", today: true };
    // A past day with no row, a stale pending row or an unknown value: the day was not finished.
    return { status: "missed", today: false };
  });
  return {
    dayNumber,
    total,
    done: squares.filter((s) => s.status === "done").length,
    revived: squares.filter((s) => s.status === "revived").length,
    squares,
  };
}
