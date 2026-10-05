import { describe, expect, it } from "vitest";
import {
  cardMissionsToTick,
  dayStatus,
  dayWork,
  hasExtraRoom,
  latestPerProblem,
  matchMission,
  MAX_EXTRAS_PER_DAY,
  nextExtraCardsRef,
  revivable,
  reviveRef,
  revivedDates,
  streak,
} from "./days";

const m = (status: string, extra: Partial<{ isRevive: boolean; isExtra: boolean }> = {}) => ({
  status,
  isRevive: extra.isRevive ?? false,
  isExtra: extra.isExtra ?? false,
});

describe("dayStatus", () => {
  it("extra missions added outside the template never reopen a finished day", () => {
    expect(dayStatus([m("done"), m("open", { isExtra: true })], true)).toBe("done");
    expect(dayStatus([m("open"), m("done", { isExtra: true })], true)).toBe("missed");
  });

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

  it("leaves out a day whose revive has already started", () => {
    const d = [
      { date: "2026-09-25", status: "missed" },
      { date: "2026-09-26", status: "partial" },
    ];
    expect(revivable(d, "2026-09-27", ["2026-09-26"])).toEqual(["2026-09-25"]);
  });
});

const rv = (reviveOf: string, status: string) => ({ status, isRevive: true, reviveOf });

describe("revivedDates", () => {
  it("a revive is complete once every one of its missions is done", () => {
    expect(revivedDates([rv("2026-09-26", "done"), rv("2026-09-26", "done"), rv("2026-09-25", "open")])).toEqual(["2026-09-26"]);
  });

  it("a skipped revive mission doesn't count as done", () => {
    expect(revivedDates([rv("2026-09-26", "done"), rv("2026-09-26", "skipped")])).toEqual([]);
  });

  it("ignores today's own missions", () => {
    expect(revivedDates([{ status: "open", isRevive: false, reviveOf: null }, rv("2026-09-26", "done")])).toEqual(["2026-09-26"]);
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

const cards = (status: string, id: string) => ({ id, slotType: "cards", status });

describe("cardMissionsToTick", () => {
  it("ticks one open cards mission per 10 answered cards, in order", () => {
    const ms = [cards("open", "c1"), cards("open", "c2"), { id: "p", slotType: "new_problem", status: "open" }];
    expect(cardMissionsToTick(ms, 9)).toEqual([]);
    expect(cardMissionsToTick(ms, 10)).toEqual(["c1"]);
    expect(cardMissionsToTick(ms, 25)).toEqual(["c1", "c2"]);
  });

  it("counts missions already done", () => {
    expect(cardMissionsToTick([cards("done", "c1"), cards("open", "c2")], 12)).toEqual([]);
    expect(cardMissionsToTick([cards("done", "c1"), cards("open", "c2")], 20)).toEqual(["c2"]);
  });

  it("ticks today's own card missions before revive ones, then the revive ones", () => {
    const ms = [{ ...cards("open", "r1"), isRevive: true }, cards("open", "c1")];
    expect(cardMissionsToTick(ms, 10)).toEqual(["c1"]);
    expect(cardMissionsToTick(ms, 20)).toEqual(["c1", "r1"]);
  });
});

describe("extra cards missions", () => {
  it("tick after the day's own and revive ones, one per 10 answers, whatever the row order", () => {
    const ms = [{ ...cards("open", "x1"), isExtra: true }, cards("done", "c1"), { ...cards("open", "r1"), isRevive: true }];
    expect(cardMissionsToTick(ms, 10)).toEqual([]);
    expect(cardMissionsToTick(ms, 20)).toEqual(["r1"]);
    expect(cardMissionsToTick(ms, 30)).toEqual(["r1", "x1"]);
    expect(cardMissionsToTick([{ ...cards("open", "x1"), isExtra: true }, cards("open", "c1")], 10)).toEqual(["c1"]);
  });

  it("never block or reopen a finished day", () => {
    expect(dayStatus([m("done"), m("skipped"), m("open", { isExtra: true })], false)).toBe("done");
  });
});

const extras = (n: number) => Array.from({ length: n }, () => ({ isExtra: true }));

describe("extras per day", () => {
  it("allows up to the cap and then stops", () => {
    expect(hasExtraRoom([{ isExtra: false }, ...extras(MAX_EXTRAS_PER_DAY - 1)])).toBe(true);
    expect(hasExtraRoom([{ isExtra: false }, ...extras(MAX_EXTRAS_PER_DAY)])).toBe(false);
  });
});

describe("nextExtraCardsRef", () => {
  it("is cards-extra-1 first, then the next free number, never colliding with another ref", () => {
    expect(nextExtraCardsRef(["cards-1", "two-sum"])).toBe("cards-extra-1");
    expect(nextExtraCardsRef(["cards-1", "cards-extra-1", "cards-extra-2"])).toBe("cards-extra-3");
    expect(nextExtraCardsRef(["cards-extra-2"])).toBe("cards-extra-1");
  });
});

describe("reviveRef", () => {
  it("gives a revived card mission its own ref, so it never collides with today's cards-1", () => {
    expect(reviveRef({ slotType: "cards", ref: "cards-1" }, "2026-09-26")).toBe("cards-1-2026-09-26");
    expect(reviveRef({ slotType: "cards", ref: "cards-1" }, "2026-09-26")).not.toBe("cards-1");
  });

  it("keeps problem and topic refs, which link to the Library", () => {
    expect(reviveRef({ slotType: "new_problem", ref: "two-sum" }, "2026-09-26")).toBe("two-sum");
    expect(reviveRef({ slotType: "topic", ref: "sd-caching" }, "2026-09-26")).toBe("sd-caching");
  });
});

const day = (date: string, status: string, campaignId = "c1") => ({ date, status, campaignId });

describe("dayWork", () => {
  const campaign = { id: "c1", startDate: "2026-10-01" };
  const today = "2026-10-04";

  it("is a pure read once today has a row and every past day is closed", () => {
    const rows = [day("2026-10-01", "done"), day("2026-10-02", "missed"), day("2026-10-03", "partial"), day(today, "pending")];
    expect(dayWork(rows, campaign, today, today)).toEqual({ close: false, claim: false });
    // Today already finished is still a read.
    expect(dayWork([...rows.slice(0, 3), day(today, "done")], campaign, today, today)).toEqual({ close: false, claim: false });
  });

  it("claims on the first open of the day", () => {
    const rows = [day("2026-10-01", "done"), day("2026-10-02", "done"), day("2026-10-03", "done")];
    expect(dayWork(rows, campaign, today, today)).toEqual({ close: false, claim: true });
  });

  it("claims the campaign's first day, with nothing to close", () => {
    expect(dayWork([], campaign, "2026-10-01", "2026-10-01")).toEqual({ close: false, claim: true });
  });

  it("closes yesterday when it is still pending (the first open after midnight)", () => {
    const rows = [day("2026-10-01", "done"), day("2026-10-02", "done"), day("2026-10-03", "pending")];
    expect(dayWork(rows, campaign, today, today)).toEqual({ close: true, claim: true });
  });

  it("closes a pending day even when today already has a row", () => {
    const rows = [day("2026-10-02", "pending"), day("2026-10-03", "done"), day(today, "pending")];
    expect(dayWork(rows, campaign, today, today).close).toBe(true);
  });

  it("closes a pending past day left over from another campaign", () => {
    const rows = [
      day("2026-09-20", "pending", "old"),
      day("2026-10-01", "done"),
      day("2026-10-02", "done"),
      day("2026-10-03", "done"),
      day(today, "pending"),
    ];
    expect(dayWork(rows, campaign, today, today)).toEqual({ close: true, claim: false });
  });

  it("fills days the app was not opened on", () => {
    expect(dayWork([day("2026-10-01", "done")], campaign, today, today)).toEqual({ close: true, claim: true });
    expect(dayWork([], campaign, today, today)).toEqual({ close: true, claim: true });
  });

  it("ignores another campaign's rows when looking for gaps", () => {
    const rows = [day("2026-10-03", "done", "old")];
    expect(dayWork(rows, campaign, today, today).close).toBe(true);
  });

  it("an ended campaign never claims, and is a read once every day is closed", () => {
    const end = "2026-10-04"; // the day after the last day
    const rows = [day("2026-10-01", "done"), day("2026-10-02", "done"), day("2026-10-03", "missed")];
    expect(dayWork(rows, campaign, end, null)).toEqual({ close: false, claim: false });
    expect(dayWork([...rows.slice(0, 2), day("2026-10-03", "pending")], campaign, end, null)).toEqual({ close: true, claim: false });
    expect(dayWork(rows.slice(0, 2), campaign, end, null)).toEqual({ close: true, claim: false });
  });

  it("a time zone moved back a day: today's row exists among later ones", () => {
    const rows = [day("2026-10-03", "done"), day(today, "pending"), day("2026-10-05", "pending")];
    expect(dayWork(rows, campaign, today, today)).toEqual({ close: false, claim: false });
  });
});
