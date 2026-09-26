import { addDays } from "./dates";

// Problems you failed or needed hints on come back on a ladder: 3, 7, then 21
// days. A clean solve climbs a step; solving at the top graduates it.
// First-try solves never come back.

const LADDER_DAYS = { 1: 3, 2: 7, 3: 21 } as const;

export type Review = { step: 1 | 2 | 3; dueDate: string; status: "active" | "graduated" | "dismissed" };
export type Result = "solved" | "hints" | "failed";

const enter = (today: string): Review => ({ step: 1, dueDate: addDays(today, LADDER_DAYS[1]), status: "active" });

export function applyCheckin(prev: Review | null, result: Result, today: string): Review | null {
  if (result !== "solved") return enter(today);
  if (!prev || prev.status !== "active") return prev;
  if (prev.step === 3) return { ...prev, dueDate: today, status: "graduated" };
  const step = (prev.step + 1) as 2 | 3;
  return { step, dueDate: addDays(today, LADDER_DAYS[step]), status: "active" };
}

/** "Not today": back tomorrow, same step. */
export function postpone(review: Review, today: string): Review {
  return { ...review, dueDate: addDays(today, 1) };
}

/** "I've got this": off the ladder for good (unless you struggle with it again). */
export function dismiss(review: Review): Review {
  return { ...review, status: "dismissed" };
}
