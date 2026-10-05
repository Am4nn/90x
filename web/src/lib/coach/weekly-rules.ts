import { z } from "zod";
import { addDays, type Weekday, weekday } from "@/lib/tracker/dates";
import type { Focus } from "@/lib/tracker/planner";
import { MAX_PER_SLOT, parseTemplates, SLOT_TYPES, type Templates } from "@/lib/tracker/template";

// The Sunday weekly review: the coach's own score, a short
// read of the week, and at most three template changes that only apply after
// the user accepts them. Pure rules; lib/coach/weekly.ts does I/O.

const MAX_CHANGES = 3;

/** The Monday of the week that `date` falls in; a Sunday review covers Monday to Sunday. */
export function weekStartOf(date: string): string {
  return addDays(date, -((weekday(date) + 6) % 7));
}

/**
 * Whether a review should stay hidden on this device. The stored value is the
 * `weekStart` of the review that was dismissed, so the comparison is exact
 * equality: a new review has a new weekStart and shows again with no other
 * bookkeeping, and a value we do not recognise (nothing stored, or something
 * another version wrote) hides nothing.
 */
/** "Sep 28": a review's week as the screens show it. The date is a calendar date, so no time zone moves it. */
export function weekLabel(weekStart: string): string {
  return new Date(`${weekStart}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function isWeeklyDismissed(dismissedWeek: string | null, weekStart: string): boolean {
  return dismissedWeek === weekStart;
}

const ChangeSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  slot: z.enum(SLOT_TYPES),
  from: z.number().int().min(0).max(MAX_PER_SLOT),
  to: z.number().int().min(0).max(MAX_PER_SLOT),
  why: z.string().min(1).max(200),
});
export type Change = z.infer<typeof ChangeSchema>;

const MAX_FOCUS = 2;
/** How many unstudied topics the review prompt lists as focus candidates. */
const TOPIC_CANDIDATES = 40;

const StoredFocus = z.object({ patterns: z.array(z.string()), topics: z.array(z.string()) });
const FocusSchema = z.object({
  patterns: z.array(z.string()).max(MAX_FOCUS),
  topics: z.array(z.string()).max(MAX_FOCUS),
});

/** What the review model returns. */
export const WeeklySchema = z.object({
  coachScore: z.number().int().min(0).max(100),
  summary: z.string().min(1).max(2000),
  suggestedChanges: z.array(z.unknown()).max(6),
  focus: FocusSchema,
});

const keepKnown = (slugs: string[], allowed: Iterable<string>) => {
  const ok = new Set(allowed);
  return [...new Set(slugs)].filter((s) => ok.has(s)).slice(0, MAX_FOCUS);
};

/**
 * The focus the model picked, cut down to what the daily rules can use: only
 * slugs from the lists the prompt offered, no repeats, at most two of each.
 * Anything else is dropped without a word.
 */
export function validFocus(raw: unknown, known: { patterns: Iterable<string>; topics: Iterable<string> }): Focus {
  const parsed = StoredFocus.safeParse(raw);
  if (!parsed.success) return { patterns: [], topics: [] };
  return { patterns: keepKnown(parsed.data.patterns, known.patterns), topics: keepKnown(parsed.data.topics, known.topics) };
}

/** A stored `weekly_reviews.focus` ('{}' when the review set none), or null when it holds nothing usable. */
export function parseFocus(raw: unknown): Focus | null {
  const parsed = StoredFocus.safeParse(raw);
  return parsed.success && (parsed.data.patterns.length || parsed.data.topics.length) ? parsed.data : null;
}

/**
 * The unstudied topics the review may choose a focus from: the weakest areas
 * first (no data counts as weakest), most important first inside an area, and
 * dealt out one per area per round so a long weak area cannot crowd out the
 * rest. Capped so the prompt stays short.
 */
export function topicCandidates<T extends { area: string; importance: number }>(
  unstudied: T[],
  areaScores: Record<string, number | null>,
  cap = TOPIC_CANDIDATES,
): T[] {
  const rank = (area: string) => areaScores[area] ?? -1;
  const byImportance = unstudied.toSorted((a, b) => b.importance - a.importance);
  const seen = new Map<string, number>();
  return byImportance
    .map((t) => {
      const round = seen.get(t.area) ?? 0;
      seen.set(t.area, round + 1);
      return { t, round };
    })
    .toSorted((a, b) => a.round - b.round || rank(a.t.area) - rank(b.t.area))
    .slice(0, cap)
    .map(({ t }) => t);
}

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
