import { localDate, shortDate } from "@/lib/tracker/dates";

// Pure helpers for the "Your reviews" rows (problem page, Me → Coach).

export function verdictOf(correct: boolean | null) {
  if (correct === true) return { label: "Correct", tone: "ok" } as const;
  if (correct === false) return { label: "Wrong", tone: "bad" } as const;
  return { label: "Reviewed", tone: "neutral" } as const;
}

/** "Today" when written on the reader's today, else the short date of that local day. */
export function reviewWhen(createdAt: string, today: string, timezone: string): string {
  const day = localDate(timezone, new Date(createdAt));
  return day === today ? "Today" : shortDate(day);
}

/** A joined query row (complexity still the stored jsonb) to the row the lists render: `time` is
 *  complexity.yours.time, or null when the review has none. */
export function shapeReviewRow<T extends { complexity: unknown }>({
  complexity,
  ...row
}: T): Omit<T, "complexity"> & { time: string | null } {
  const time = (complexity as { yours?: { time?: unknown } } | null)?.yours?.time;
  return { ...row, time: typeof time === "string" ? time : null };
}
