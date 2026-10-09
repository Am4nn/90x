import { z } from "zod";
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

export const MAX_FOCUS_COMPANIES = 10;
const MAX_COMPANY_LENGTH = 60;

/** The stored company focus: up to ten companies sharing one time window. */
export type CompanyFocus = { companies: string[]; from: string; to: string };

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const storedFocus = z.union([
  z.object({ companies: z.array(z.string()), from: day, to: day }),
  // The shape before multi-select: one company.
  z.object({ company: z.string(), from: day, to: day }),
]);

/** Trim, drop blanks, de-duplicate ignoring case (first pick wins) and use the
 *  catalog's own casing when a name matches a known company. */
export function cleanCompanies(names: readonly string[], known: Iterable<string> = []): string[] {
  const canonical = new Map<string, string>();
  for (const k of known) canonical.set(k.toLowerCase(), k);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim().slice(0, MAX_COMPANY_LENGTH).trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(canonical.get(key) ?? name);
  }
  return out;
}

/** The one reader of a stored focus: accepts the old `{company}` rows and the new
 *  `{companies}` rows, and returns null for anything else or an empty list. */
export function parseFocus(raw: unknown): CompanyFocus | null {
  const parsed = storedFocus.safeParse(raw);
  if (!parsed.success) return null;
  const v = parsed.data;
  const companies = cleanCompanies("companies" in v ? v.companies : [v.company]).slice(0, MAX_FOCUS_COMPANIES);
  return companies.length ? { companies, from: v.from, to: v.to } : null;
}

/** A new plan keeps the focus companies for a fresh window of the same length;
 *  a window that already ended is not carried. */
export function carriedFocus(raw: unknown, today: string, newStart: string): CompanyFocus | null {
  const old = parseFocus(raw);
  if (!old || old.to < today) return null;
  const length = daysBetween(old.from, old.to) + 1;
  return { companies: old.companies, from: newStart, to: addDays(newStart, length - 1) };
}
