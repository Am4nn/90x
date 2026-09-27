import { describe, expect, it } from "vitest";
import { proposeTemplate, type Templates } from "@/lib/tracker/template";
import { applyChanges, type Change, validChanges, weekStartOf } from "./weekly-rules";

// 150 minutes a weekday: { new_problem: 2, review: 1, topic: 1, cards: 1 }.
const templates = (): Templates => proposeTemplate(150, 150);
const change = (over: Partial<Change> = {}): Change => ({
  weekday: 1,
  slot: "review",
  from: 1,
  to: 2,
  why: "Reviews keep slipping.",
  ...over,
});

describe("weekStartOf", () => {
  it("is the Monday of the week that ends on the Sunday review", () => {
    expect(weekStartOf("2026-09-27")).toBe("2026-09-21"); // Sunday
    expect(weekStartOf("2026-09-21")).toBe("2026-09-21"); // Monday
    expect(weekStartOf("2026-09-24")).toBe("2026-09-21"); // Thursday
  });
});

describe("validChanges", () => {
  it("keeps a change that matches the current plan", () => {
    expect(validChanges(templates(), [change()])).toEqual([change()]);
  });

  it("drops a change whose 'from' is not what the plan has now", () => {
    expect(validChanges(templates(), [change({ from: 3 })])).toEqual([]);
  });

  it("drops no-ops, counts over the limit and unknown weekdays", () => {
    expect(validChanges(templates(), [change({ to: 1 }), change({ to: 7 }), change({ weekday: 9 })])).toEqual([]);
  });

  it("drops a change that would leave a day with nothing that finishes it", () => {
    const t = templates();
    t[2] = { new_problem: 1, review: 0, topic: 0, cards: 2 };
    expect(validChanges(t, [change({ weekday: 2, slot: "new_problem", from: 1, to: 0 })])).toEqual([]);
  });

  it("allows only one change per weekday and slot, and at most three", () => {
    const many = [change(), change({ to: 3 }), change({ weekday: 2 }), change({ weekday: 3 }), change({ weekday: 4 })];
    expect(validChanges(templates(), many).map((c) => c.weekday)).toEqual([1, 2, 3]);
  });

  it("drops malformed entries instead of failing", () => {
    expect(validChanges(templates(), [{ weekday: 1 }, null, "x", change()])).toEqual([change()]);
  });
});

describe("applyChanges", () => {
  it("sets each slot to its new count and leaves the rest", () => {
    const next = applyChanges(templates(), [change(), change({ weekday: 0, slot: "cards", from: 1, to: 0 })]);
    expect(next?.[1].review).toBe(2);
    expect(next?.[0].cards).toBe(0);
    expect(next?.[3]).toEqual(templates()[3]);
  });

  it("refuses when the plan changed since the review was written", () => {
    const t = templates();
    t[1].review = 3;
    expect(applyChanges(t, [change()])).toBeNull();
  });
});
