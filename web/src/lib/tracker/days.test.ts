import { describe, expect, it } from "vitest";
import { dayStatus, latestPerProblem, matchMission, revivable, streak } from "./days";

const m = (status: string, extra: Partial<{ isRevive: boolean }> = {}) => ({ status, isRevive: extra.isRevive ?? false });

describe("dayStatus", () => {
  it("done when every countable mission is done or skipped; card slots don't count", () => {
    expect(dayStatus([m("done"), m("skipped"), m("coming_soon")], false)).toBe("done");
  });

  it("pending while open, then partial or missed when the day closes", () => {
    expect(dayStatus([m("done"), m("open")], false)).toBe("pending");
    expect(dayStatus([m("done"), m("open")], true)).toBe("partial");
    expect(dayStatus([m("open"), m("open")], true)).toBe("missed");
  });

  it("revive missions (another day's leftovers) don't count toward today", () => {
    expect(dayStatus([m("done"), m("open", { isRevive: true })], false)).toBe("done");
  });

  it("a day with nothing countable is a rest day, not a free X", () => {
    expect(dayStatus([m("coming_soon")], true)).toBe("rest");
    expect(dayStatus([], false)).toBe("rest");
  });
});

const days = (list: [string, string][]) => list.map(([date, status]) => ({ date, status }));

describe("streak", () => {
  it("counts done and revived days back from yesterday, plus today once done", () => {
    const d = days([
      ["2026-09-24", "done"],
      ["2026-09-25", "revived"],
      ["2026-09-26", "done"],
      ["2026-09-27", "pending"],
    ]);
    expect(streak(d, "2026-09-27")).toBe(3);
    expect(streak([...d.slice(0, 3), { date: "2026-09-27", status: "done" }], "2026-09-27")).toBe(4);
  });

  it("a rest day neither extends nor breaks it", () => {
    expect(
      streak(
        days([
          ["2026-09-24", "done"],
          ["2026-09-25", "rest"],
          ["2026-09-26", "done"],
        ]),
        "2026-09-27",
      ),
    ).toBe(2);
  });

  it("a partial or missed day breaks it", () => {
    expect(
      streak(
        days([
          ["2026-09-25", "done"],
          ["2026-09-26", "partial"],
        ]),
        "2026-09-27",
      ),
    ).toBe(0);
    expect(
      streak(
        days([
          ["2026-09-24", "done"],
          ["2026-09-25", "missed"],
          ["2026-09-26", "done"],
        ]),
        "2026-09-27",
      ),
    ).toBe(1);
  });
});

describe("revivable", () => {
  it("missed days from the last two days can be revived", () => {
    const d = [
      { date: "2026-09-24", status: "missed" },
      { date: "2026-09-25", status: "missed" },
      { date: "2026-09-26", status: "partial" },
    ];
    expect(revivable(d, "2026-09-27")).toEqual(["2026-09-25", "2026-09-26"]);
  });
});

describe("matchMission", () => {
  const missions = [
    { id: "r", slotType: "review", ref: "two-sum", status: "open", patternSlug: "arrays" },
    { id: "n1", slotType: "new_problem", ref: "min-window", status: "open", patternSlug: "sliding-window" },
    { id: "n2", slotType: "new_problem", ref: "islands", status: "done", patternSlug: "graphs" },
    { id: "t", slotType: "topic", ref: "caching", status: "open", patternSlug: null },
  ];

  it("prefers today's own mission over a revive mission", () => {
    const withRevive = [
      { id: "rv", slotType: "new_problem", ref: "max-window", status: "open", patternSlug: "sliding-window", isRevive: true },
      ...missions.map((x) => ({ ...x, isRevive: false })),
    ];
    expect(matchMission(withRevive, { slug: "min-subarray", patternSlug: "sliding-window" })).toBe("n1");
    expect(matchMission(withRevive, { slug: "max-window", patternSlug: "sliding-window" })).toBe("rv");
  });

  it("matches the exact problem first", () => {
    expect(matchMission(missions, { slug: "two-sum", patternSlug: "arrays" })).toBe("r");
    expect(matchMission(missions, { slug: "min-window", patternSlug: "sliding-window" })).toBe("n1");
  });

  it("extra work in the same pattern ticks an open new-problem mission", () => {
    expect(matchMission(missions, { slug: "max-window", patternSlug: "sliding-window" })).toBe("n1");
  });

  it("never ticks done missions, topics, or other patterns", () => {
    expect(matchMission(missions, { slug: "clone-graph", patternSlug: "graphs" })).toBeNull();
    expect(matchMission(missions, { slug: "caching", patternSlug: null })).toBeNull();
  });
});

describe("latestPerProblem", () => {
  it("keeps one check-in per problem, the latest", () => {
    const got = latestPerProblem([
      { slug: "a", result: "failed", createdAt: "2026-09-27T10:00:00Z" },
      { slug: "a", result: "solved", createdAt: "2026-09-27T11:00:00Z" },
      { slug: "b", result: "hints", createdAt: "2026-09-27T09:00:00Z" },
    ]);
    expect(got.map((c) => `${c.slug}:${c.result}`).toSorted()).toEqual(["a:solved", "b:hints"]);
  });
});
