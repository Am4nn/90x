import { describe, expect, it } from "vitest";
import { MAX_PER_SLOT, SLOT_TYPES, parseTemplates, proposeSlots, proposeTemplate, templateMinutes } from "./template";

describe("proposeSlots", () => {
  it("fills a 2h 30m day with one of each and a second new problem", () => {
    expect(proposeSlots(150)).toEqual({ new_problem: 2, review: 1, topic: 1, cards: 1 });
  });

  it("never exceeds the budget", () => {
    for (const minutes of [30, 60, 90, 120, 180, 240, 480]) {
      expect(templateMinutes(proposeSlots(minutes))).toBeLessThanOrEqual(Math.max(minutes, 40));
    }
  });

  it("always has at least one new problem", () => {
    expect(proposeSlots(30).new_problem).toBe(1);
  });

  it("an hour is a new problem and a card set", () => {
    expect(proposeSlots(60)).toEqual({ new_problem: 1, review: 0, topic: 0, cards: 1 });
  });
});

// The slots the app produced before it had levels, written out rather than
// computed, so a change to the round-robin cannot quietly rewrite them. Every
// account that has no level must keep planning exactly like this, which is what
// makes adding a level safe - so this is the first thing the level work pins.
const NO_LEVEL = {
  60: { new_problem: 1, review: 0, topic: 0, cards: 1 },
  120: { new_problem: 1, review: 1, topic: 1, cards: 1 },
  180: { new_problem: 2, review: 2, topic: 1, cards: 1 },
  240: { new_problem: 2, review: 2, topic: 2, cards: 3 },
} as const;

const LEVELS_TO_TEST = [null, "first_time", "some_practice", "ready"] as const;
const MINUTES_TO_TEST = [30, 60, 90, 120, 180, 240, 480];

describe("proposeSlots with no level", () => {
  it("returns exactly today's slots for every budget", () => {
    for (const [minutes, slots] of Object.entries(NO_LEVEL)) {
      expect(proposeSlots(Number(minutes))).toEqual(slots);
      expect(proposeSlots(Number(minutes), null)).toEqual(slots);
      expect(proposeSlots(Number(minutes), undefined)).toEqual(slots);
    }
  });

  it("treats some_practice as today's round-robin too, not a fourth behaviour", () => {
    expect(proposeSlots(120, "some_practice")).toEqual(NO_LEVEL[120]);
  });
});

describe("proposeSlots at a level", () => {
  it("first_time spends its budget on reviews and topics instead of new problems", () => {
    const slots = proposeSlots(120, "first_time");
    expect(slots.review).toBeGreaterThan(NO_LEVEL[120].review);
    expect(slots.new_problem).toBeLessThanOrEqual(NO_LEVEL[120].new_problem);
  });

  it("ready spends it on new problems instead", () => {
    const slots = proposeSlots(120, "ready");
    expect(slots.new_problem).toBeGreaterThan(NO_LEVEL[120].new_problem);
  });

  it("never exceeds the budget, at any level", () => {
    for (const level of LEVELS_TO_TEST) {
      for (const minutes of MINUTES_TO_TEST) {
        expect(templateMinutes(proposeSlots(minutes, level))).toBeLessThanOrEqual(Math.max(minutes, 40));
      }
    }
  });

  it("always leaves a day the editor will accept, at any level", () => {
    // TemplatesSchema refuses a day of only card slots, so a mix must always
    // keep one slot that counts toward the X.
    for (const level of LEVELS_TO_TEST) {
      for (const minutes of MINUTES_TO_TEST) {
        const slots = proposeSlots(minutes, level);
        expect(slots.new_problem + slots.review + slots.topic).toBeGreaterThan(0);
        for (const t of SLOT_TYPES) expect(slots[t]).toBeLessThanOrEqual(MAX_PER_SLOT);
      }
    }
  });
});

describe("proposeTemplate", () => {
  it("uses the weekend budget on Saturday and Sunday", () => {
    const t = proposeTemplate(60, 240);
    expect(t[1]).toEqual(proposeSlots(60));
    expect(t[0]).toEqual(proposeSlots(240));
    expect(t[6]).toEqual(proposeSlots(240));
  });

  it("still treats days 0 and 6 as the weekend at every level", () => {
    for (const level of LEVELS_TO_TEST) {
      const t = proposeTemplate(60, 240, level);
      expect(t[1]).toEqual(proposeSlots(60, level));
      expect(t[2]).toEqual(proposeSlots(60, level));
      expect(t[5]).toEqual(proposeSlots(60, level));
      expect(t[0]).toEqual(proposeSlots(240, level));
      expect(t[6]).toEqual(proposeSlots(240, level));
    }
  });
});

describe("parseTemplates", () => {
  it("accepts seven weekdays of small counts", () => {
    const t = proposeTemplate(120, 180);
    expect(parseTemplates(t).success).toBe(true);
  });

  it("rejects negative or huge counts and missing days", () => {
    const t = proposeTemplate(120, 180) as Record<number, unknown>;
    expect(parseTemplates({ ...t, 1: { new_problem: -1, review: 0, topic: 0, cards: 0 } }).success).toBe(false);
    expect(parseTemplates({ ...t, 1: { new_problem: 20, review: 0, topic: 0, cards: 0 } }).success).toBe(false);
    const missing = { ...t };
    delete missing[3];
    expect(parseTemplates(missing).success).toBe(false);
  });

  it("rejects a day of only card slots (nothing counts toward the X yet)", () => {
    const t = proposeTemplate(120, 180) as Record<number, unknown>;
    expect(parseTemplates({ ...t, 2: { new_problem: 0, review: 0, topic: 0, cards: 3 } }).success).toBe(false);
  });

  it("rejects an empty day", () => {
    const t = proposeTemplate(120, 180) as Record<number, unknown>;
    expect(parseTemplates({ ...t, 2: { new_problem: 0, review: 0, topic: 0, cards: 0 } }).success).toBe(false);
  });
});
