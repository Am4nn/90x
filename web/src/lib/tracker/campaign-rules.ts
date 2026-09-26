import { addDays, daysBetween } from "./dates";

/** A campaign can change length any time, but never end before today. */
export function lengthError(startDate: string, today: string, lengthDays: number): string | null {
  if (!Number.isInteger(lengthDays) || lengthDays < 7) return "At least 7 days.";
  if (lengthDays > 365) return "At most 365 days.";
  const minimum = daysBetween(startDate, today) + 1;
  if (lengthDays < minimum) return `You're on day ${minimum}, so at least ${minimum} days.`;
  return null;
}

/** Company focus runs from today for whole weeks. */
export function focusRange(today: string, weeks: number) {
  return { from: today, to: addDays(today, weeks * 7 - 1) };
}
