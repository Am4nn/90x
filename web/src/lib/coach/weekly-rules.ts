import { z } from "zod";
import { addDays, type Weekday, weekday } from "@/lib/tracker/dates";
import { MAX_PER_SLOT, parseTemplates, SLOT_TYPES, type Templates } from "@/lib/tracker/template";

// The Sunday weekly review: the coach's own score, a short
// read of the week, and at most three template changes that only apply after
// the user accepts them. Pure rules; lib/coach/weekly.ts does I/O.

const MAX_CHANGES = 3;

/** The Monday of the week that `date` falls in; a Sunday review covers Monday to Sunday. */
export function weekStartOf(date: string): string {
  return addDays(date, -((weekday(date) + 6) % 7));
}

const ChangeSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  slot: z.enum(SLOT_TYPES),
  from: z.number().int().min(0).max(MAX_PER_SLOT),
  to: z.number().int().min(0).max(MAX_PER_SLOT),
  why: z.string().min(1).max(200),
});
export type Change = z.infer<typeof ChangeSchema>;

/** What the review model returns. */
export const WeeklySchema = z.object({
  coachScore: z.number().int().min(0).max(100),
  summary: z.string().min(1).max(2000),
  suggestedChanges: z.array(z.unknown()).max(6),
});

/**
 * The model's suggestions that make sense against the current plan: each
 * starts from the count the plan has now, changes it, keeps the plan valid
 * (parseTemplates), and touches a weekday and slot at most once. The rest are
 * dropped, never shown.
 */
export function validChanges(templates: Templates, raw: unknown[]): Change[] {
  const kept: Change[] = [];
  let current = templates;
  for (const item of raw) {
    if (kept.length >= MAX_CHANGES) break;
    const parsed = ChangeSchema.safeParse(item);
    if (!parsed.success) continue;
    const c = parsed.data;
    if (c.from === c.to || kept.some((k) => k.weekday === c.weekday && k.slot === c.slot)) continue;
    const next = applyChanges(current, [c]);
    if (!next) continue;
    kept.push(c);
    current = next;
  }
  return kept;
}

/** The plan with the changes applied, or null if it no longer matches their "from" or ends up invalid. */
export function applyChanges(templates: Templates, changes: Change[]): Templates | null {
  const next = structuredClone(templates);
  for (const c of changes) {
    const day = next[c.weekday as Weekday];
    if (!day || day[c.slot] !== c.from) return null;
    day[c.slot] = c.to;
  }
  const parsed = parseTemplates(next);
  return parsed.success ? parsed.data : null;
}
