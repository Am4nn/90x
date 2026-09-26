import { z } from "zod";

// A daily template says how many of each slot a weekday gets.
// 90x proposes one from the user's time budget; the Plan page edits it.

export const SLOT_TYPES = ["new_problem", "review", "topic", "cards"] as const;
export type SlotType = (typeof SLOT_TYPES)[number];
export type Slots = Record<SlotType, number>;
/** Keyed by weekday, 0 = Sunday … 6 = Saturday. */
export type Templates = Record<number, Slots>;

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
  const templates: Templates = {};
  for (let d = 0; d < 7; d++) templates[d] = proposeSlots(d === 0 || d === 6 ? weekendMinutes : weekdayMinutes);
  return templates;
}

const count = z.number().int().min(0).max(MAX_PER_SLOT);
const SlotsSchema = z
  .object({ new_problem: count, review: count, topic: count, cards: count })
  .refine((s) => templateMinutes(s) > 0, "A day needs at least one slot");
const TemplatesSchema = z.object(Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, SlotsSchema])));

export function parseTemplates(value: unknown) {
  return TemplatesSchema.safeParse(value) as z.ZodSafeParseResult<Templates>;
}
