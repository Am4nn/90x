import { describe, expect, it } from "vitest";
import { parseTemplates, proposeSlots, proposeTemplate, templateMinutes } from "./template";

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

describe("proposeTemplate", () => {
  it("uses the weekend budget on Saturday and Sunday", () => {
    const t = proposeTemplate(60, 240);
    expect(t[1]).toEqual(proposeSlots(60));
    expect(t[0]).toEqual(proposeSlots(240));
    expect(t[6]).toEqual(proposeSlots(240));
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
    const { 3: _, ...missing } = t;
    expect(parseTemplates(missing).success).toBe(false);
  });

  it("rejects an empty day", () => {
    const t = proposeTemplate(120, 180) as Record<number, unknown>;
    expect(parseTemplates({ ...t, 2: { new_problem: 0, review: 0, topic: 0, cards: 0 } }).success).toBe(false);
  });
});
