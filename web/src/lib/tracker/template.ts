import { z } from "zod";
import type { Weekday } from "./dates";

// A daily template says how many of each slot a weekday gets.
// 90x proposes one from the user's time budget; the Plan page edits it.

export const SLOT_TYPES = ["new_problem", "review", "topic", "cards"] as const;
export type SlotType = (typeof SLOT_TYPES)[number];
export type Slots = Record<SlotType, number>;
/** Keyed by weekday, 0 = Sunday … 6 = Saturday. */
export type Templates = Record<Weekday, Slots>;

export const SLOT_MINUTES: Slots = { new_problem: 40, review: 25, topic: 30, cards: 15 };
export const MAX_PER_SLOT = 6;

export function templateMinutes(slots: Slots): number {
  return SLOT_TYPES.reduce((sum, t) => sum + slots[t] * SLOT_MINUTES[t], 0);
}

/** Round-robin over the slot types in priority order while they still fit. */
export function proposeSlots(minutes: number): Slots {
  const slots: Slots = { new_problem: 1, review: 0, topic: 0, cards: 0 };
  let left = minutes - SLOT_MINUTES.new_problem;
  const order: SlotType[] = ["review", "topic", "cards", "new_problem"];
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

export function proposeTemplate(weekdayMinutes: number, weekendMinutes: number): Templates {
  const weekend = () => proposeSlots(weekendMinutes);
  const weekday = () => proposeSlots(weekdayMinutes);
  return { 0: weekend(), 1: weekday(), 2: weekday(), 3: weekday(), 4: weekday(), 5: weekday(), 6: weekend() };
}

const count = z.number().int().min(0).max(MAX_PER_SLOT);
const SlotsSchema = z
  .object({ new_problem: count, review: count, topic: count, cards: count })
  // Card slots don't count toward finishing a day, so each day needs one that does.
  .refine((s) => s.new_problem + s.review + s.topic > 0, "Each day needs a problem, review or topic");
const TemplatesSchema = z.object(Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, SlotsSchema])));

export function parseTemplates(value: unknown) {
  return TemplatesSchema.safeParse(value) as z.ZodSafeParseResult<Templates>;
}
