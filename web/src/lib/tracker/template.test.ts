import { describe, expect, it } from "vitest";
import {
  MAX_PER_SLOT,
  SLOT_MINUTES,
  SLOT_TYPES,
  dayMinutes,
  parseTemplates,
  proposeSlots,
  proposeTemplate,
  templateMinutes,
} from "./template";

describe("proposeSlots", () => {
  it("fills a 2h 30m day with one of each and a second new problem", () => {
    expect(proposeSlots(150)).toEqual({ new_problem: 2, review: 1, topic: 1 });
  });

  it("never exceeds the budget once the day's 10 cards are counted", () => {
    for (const minutes of [30, 60, 90, 120, 180, 240, 480]) {
      expect(dayMinutes(proposeSlots(minutes))).toBeLessThanOrEqual(Math.max(minutes, SLOT_MINUTES.new_problem + SLOT_MINUTES.cards));
    }
  });

  it("gives no cards slot at any budget", () => {
    for (const minutes of [30, 60, 120, 240, 480]) {
      expect(Object.keys(proposeSlots(minutes)).toSorted()).toEqual(["new_problem", "review", "topic"]);
    }
  });

  it("a day's time is its slots plus the 15 minutes of 10 cards", () => {
    const slots = proposeSlots(150);
    expect(templateMinutes(slots)).toBe(135);
    expect(dayMinutes(slots)).toBe(150);
  });

  it("always has at least one new problem", () => {
    expect(proposeSlots(30).new_problem).toBe(1);
  });

  it("an hour is one new problem, with the 10 cards fitting beside it", () => {
    expect(proposeSlots(60)).toEqual({ new_problem: 1, review: 0, topic: 0 });
  });
});

// The slots an account with no level gets, written out rather than computed, so
// a change to the round-robin cannot quietly rewrite them. These are the slots
// the app produced before levels existed minus the cards slot, which became a
// fixed daily mission (its 15 minutes come off the budget first). The 240 row
// used to hand out three card slots; those minutes now buy a review and a topic.
const NO_LEVEL = {
  60: { new_problem: 1, review: 0, topic: 0 },
  120: { new_problem: 1, review: 1, topic: 1 },
  180: { new_problem: 2, review: 2, topic: 1 },
  240: { new_problem: 2, review: 3, topic: 2 },
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
    expect(proposeSlots(180, "some_practice")).toEqual(NO_LEVEL[180]);
  });
});

describe("proposeSlots at a level", () => {
  it("first_time spends its budget on reviews and topics instead of new problems", () => {
    const slots = proposeSlots(180, "first_time");
    expect(slots).toEqual({ new_problem: 1, review: 2, topic: 2 });
    expect(slots.topic).toBeGreaterThan(NO_LEVEL[180].topic);
    expect(slots.new_problem).toBeLessThan(NO_LEVEL[180].new_problem);
  });

  it("ready spends it on new problems instead", () => {
    const slots = proposeSlots(120, "ready");
    expect(slots).toEqual({ new_problem: 2, review: 1, topic: 0 });
    expect(slots.new_problem).toBeGreaterThan(NO_LEVEL[120].new_problem);
  });

  it("never exceeds the budget, at any level", () => {
    for (const level of LEVELS_TO_TEST) {
      for (const minutes of MINUTES_TO_TEST) {
        expect(dayMinutes(proposeSlots(minutes, level))).toBeLessThanOrEqual(Math.max(minutes, 55));
      }
    }
  });

  it("always leaves a day the editor will accept, at any level", () => {
    // TemplatesSchema refuses a day with no slot at all, so a mix must always
    // keep one real piece of work.
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
    expect(parseTemplates({ ...t, 1: { new_problem: -1, review: 0, topic: 0 } }).success).toBe(false);
    expect(parseTemplates({ ...t, 1: { new_problem: 20, review: 0, topic: 0 } }).success).toBe(false);
    const missing = { ...t };
    delete missing[3];
    expect(parseTemplates(missing).success).toBe(false);
  });

  it("still reads a stored plan that has a cards count, and drops it", () => {
    // Plans saved before cards left the template carry cards on every day.
    const legacy = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { new_problem: 1, review: 1, topic: 1, cards: 3 }]));
    const parsed = parseTemplates(legacy);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.[2]).toEqual({ new_problem: 1, review: 1, topic: 1 });
  });

  it("rejects a day of only a legacy cards count (it is not a slot any more)", () => {
    const t = proposeTemplate(120, 180) as Record<number, unknown>;
    expect(parseTemplates({ ...t, 2: { new_problem: 0, review: 0, topic: 0, cards: 3 } }).success).toBe(false);
  });

  it("rejects an empty day", () => {
    const t = proposeTemplate(120, 180) as Record<number, unknown>;
    expect(parseTemplates({ ...t, 2: { new_problem: 0, review: 0, topic: 0 } }).success).toBe(false);
  });
});
