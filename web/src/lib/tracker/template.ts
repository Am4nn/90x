import { z } from "zod";
import type { Weekday } from "./dates";
import type { Level } from "./level";

// A daily template says how many of each slot a weekday gets.
// 90x proposes one from the user's time budget; the Plan page edits it.
//
// "10 cards" is not a slot: every day gets exactly one, always (planner.ts), so
// it is a mission type but not a template one. The missions table keeps
// slot_type = 'cards' for it.

export const SLOT_TYPES = ["new_problem", "review", "topic"] as const;
export type SlotType = (typeof SLOT_TYPES)[number];
export type Slots = Record<SlotType, number>;
/** Keyed by weekday, 0 = Sunday … 6 = Saturday. */
export type Templates = Record<Weekday, Slots>;

/** What a mission can be: a template slot, or the fixed daily "10 cards". */
export type MissionType = SlotType | "cards";

export const SLOT_MINUTES: Record<MissionType, number> = { new_problem: 40, review: 25, topic: 30, cards: 15 };

/** What a mission type is called. Two registers because both are wanted and
 *  both were being retyped: the long one for prose and headings, the short one
 *  for the Plan page's steppers where the column is narrow (which only ever
 *  shows template slots). Same shape as `DAY_NAMES`/`DAY_NAMES_LONG` in
 *  `lib/tracker/dates.ts`. */
export const SLOT_LABEL: Record<MissionType, string> = {
  new_problem: "New problems",
  review: "Reviews",
  topic: "Topics",
  cards: "Card sets",
};
export const SLOT_LABEL_SHORT: Record<SlotType, string> = {
  new_problem: "New",
  review: "Review",
  topic: "Topic",
};
export const MAX_PER_SLOT = 6;

/** The slots alone; the daily cards mission is not in it. */
export function templateMinutes(slots: Slots): number {
  return SLOT_TYPES.reduce((sum, t) => sum + slots[t] * SLOT_MINUTES[t], 0);
}

/** A day's whole time: its slots plus the one "10 cards" mission every day has. */
export function dayMinutes(slots: Slots): number {
  return templateMinutes(slots) + SLOT_MINUTES.cards;
}

/** "1h 50m": a day's time, as the week preview, the day-by-day editor and Today all show it. */
export function hours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

/** The order the round-robin walks, per level. A slot type listed twice gets
 *  two turns per pass, so it fills sooner; the budget still decides what
 *  actually fits, and the total never changes because of a level - only the
 *  mix. `some_practice` and no level are the order the app used before levels
 *  existed. */
const ROUND_ROBIN: Record<Level, SlotType[]> = {
  first_time: ["review", "topic", "review", "topic", "new_problem"],
  some_practice: ["review", "topic", "new_problem"],
  ready: ["new_problem", "review", "topic"],
};

/** Round-robin over the slot types in priority order while they still fit.
 *  The day's "10 cards" mission is paid for first, so the whole day (slots plus
 *  cards) stays inside the budget. A level only reorders the walk. */
export function proposeSlots(minutes: number, level?: Level | null): Slots {
  const slots: Slots = { new_problem: 1, review: 0, topic: 0 };
  let left = minutes - SLOT_MINUTES.cards - SLOT_MINUTES.new_problem;
  const order = ROUND_ROBIN[level ?? "some_practice"];
  for (let added = true; added;) {
    added = false;
    for (const t of order) {
      if (SLOT_MINUTES[t] <= left && slots[t] < MAX_PER_SLOT) {
        slots[t] += 1;
        left -= SLOT_MINUTES[t];
        added = true;
      }
    }
  }
  return slots;
}

export function proposeTemplate(weekdayMinutes: number, weekendMinutes: number, level?: Level | null): Templates {
  const weekend = () => proposeSlots(weekendMinutes, level);
  const weekday = () => proposeSlots(weekdayMinutes, level);
  return { 0: weekend(), 1: weekday(), 2: weekday(), 3: weekday(), 4: weekday(), 5: weekday(), 6: weekend() };
}

const count = z.number().int().min(0).max(MAX_PER_SLOT);
const SlotsSchema = z
  // Stored plans from before cards left the template still carry a `cards`
  // count; z.object drops the key, so it is read and ignored.
  .object({ new_problem: count, review: count, topic: count })
  // Each day needs a slot that is real work, not only the cards mission.
  .refine((s) => s.new_problem + s.review + s.topic > 0, "Each day needs a problem, review or topic");
const TemplatesSchema = z.object(Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, SlotsSchema])));

export function parseTemplates(value: unknown) {
  return TemplatesSchema.safeParse(value) as z.ZodSafeParseResult<Templates>;
}
