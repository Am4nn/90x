import { describe, expect, it } from "vitest";
import { proposeTemplate, type Templates } from "@/lib/tracker/template";
import {
  applyChanges,
  type Change,
  isWeeklyDismissed,
  parseFocus,
  topicCandidates,
  validChanges,
  validFocus,
  WeeklySchema,
  weekLabel,
  weekStartOf,
} from "./weekly-rules";

// 150 minutes a weekday: { new_problem: 2, review: 1, topic: 1 }.
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

describe("isWeeklyDismissed", () => {
  it("does not hide anything when the device has stored nothing", () => {
    expect(isWeeklyDismissed(null, "2026-09-21")).toBe(false);
  });

  it("hides only the week it was dismissed for", () => {
    expect(isWeeklyDismissed("2026-09-21", "2026-09-21")).toBe(true);
    // The whole point of keying on weekStart: an earlier dismissal must not hide
    // the review that arrives next week.
    expect(isWeeklyDismissed("2026-09-14", "2026-09-21")).toBe(false);
    expect(isWeeklyDismissed("2026-09-28", "2026-09-21")).toBe(false);
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
    t[2] = { new_problem: 1, review: 0, topic: 0 };
    expect(validChanges(t, [change({ weekday: 2, slot: "new_problem", from: 1, to: 0 })])).toEqual([]);
  });

  it("drops a change to the cards slot, which is no longer a slot", () => {
    // What a model, or a review stored before the change, can still send.
    const cards = { weekday: 3, slot: "cards", from: 1, to: 0, why: "Cards went unread." };
    expect(validChanges(templates(), [cards, change()])).toEqual([change()]);
    expect(validChanges(templates(), [{ ...cards, from: 0, to: 1 }])).toEqual([]);
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
    const next = applyChanges(templates(), [change(), change({ weekday: 0, slot: "topic", from: 1, to: 0 })]);
    expect(next?.[1].review).toBe(2);
    expect(next?.[0].topic).toBe(0);
    expect(next?.[3]).toEqual(templates()[3]);
  });

  it("refuses when the plan changed since the review was written", () => {
    const t = templates();
    t[1].review = 3;
    expect(applyChanges(t, [change()])).toBeNull();
  });
});

describe("weekLabel", () => {
  it("writes the week's Monday as a short date, whatever the viewer's time zone", () => {
    expect(weekLabel("2026-09-28")).toBe("Sep 28");
    expect(weekLabel("2026-10-05")).toBe("Oct 5");
    expect(weekLabel("2026-01-05")).toBe("Jan 5");
  });
});

describe("validFocus", () => {
  const known = { patterns: ["arrays", "graphs", "dp"], topics: ["caching", "jvm", "joins"] };

  it("keeps known slugs and drops unknown ones", () => {
    expect(validFocus({ patterns: ["graphs", "nope"], topics: ["ghost", "jvm"] }, known)).toEqual({
      patterns: ["graphs"],
      topics: ["jvm"],
    });
  });

  it("removes repeats and keeps at most two of each", () => {
    expect(validFocus({ patterns: ["graphs", "graphs", "dp", "arrays"], topics: ["jvm", "jvm"] }, known)).toEqual({
      patterns: ["graphs", "dp"],
      topics: ["jvm"],
    });
  });

  it("caps after dropping unknown slugs, so a bad first pick does not cost a good one", () => {
    expect(validFocus({ patterns: ["x", "y", "graphs", "dp"], topics: [] }, known).patterns).toEqual(["graphs", "dp"]);
  });

  it("returns an empty focus for anything malformed", () => {
    const none = { patterns: [], topics: [] };
    expect(validFocus(undefined, known)).toEqual(none);
    expect(validFocus({}, known)).toEqual(none);
    expect(validFocus({ patterns: "graphs", topics: 3 }, known)).toEqual(none);
  });
});

describe("WeeklySchema focus", () => {
  const review = { coachScore: 50, summary: "ok", suggestedChanges: [] };
  it("accepts up to two of each and rejects more", () => {
    expect(WeeklySchema.safeParse({ ...review, focus: { patterns: ["a", "b"], topics: ["c"] } }).success).toBe(true);
    expect(WeeklySchema.safeParse({ ...review, focus: { patterns: ["a", "b", "c"], topics: [] } }).success).toBe(false);
    expect(WeeklySchema.safeParse({ ...review, focus: { patterns: [], topics: ["a", "b", "c"] } }).success).toBe(false);
  });
});

describe("parseFocus", () => {
  it("reads a stored focus, and treats the empty default as none", () => {
    expect(parseFocus({ patterns: ["graphs"], topics: [] })).toEqual({ patterns: ["graphs"], topics: [] });
    expect(parseFocus({})).toBeNull();
    expect(parseFocus({ patterns: [], topics: [] })).toBeNull();
    expect(parseFocus(null)).toBeNull();
  });
});

const t = (slug: string, area: string, importance: number) => ({ slug, area, importance });

describe("topicCandidates", () => {
  const topics = [t("a1", "sql", 0.9), t("a2", "sql", 0.8), t("b1", "java", 0.5), t("b2", "java", 0.4), t("c1", "cs", 0.7)];

  it("lists the weakest areas first, most important first inside an area, one per area per round", () => {
    const got = topicCandidates(topics, { sql: 70, java: 20, cs: null }).map((x) => x.slug);
    expect(got).toEqual(["c1", "b1", "a1", "b2", "a2"]);
  });

  it("caps the list", () => {
    expect(topicCandidates(topics, {}, 2)).toHaveLength(2);
  });
});
