import { describe, expect, it } from "vitest";
import {
  accuracy,
  activation,
  analyticsCacheKey,
  fillDays,
  formatMinutes,
  isActiveOutcome,
  isCachedFor,
  isActivatingOutcome,
  isMature,
  isTestEmail,
  launchGate,
  localDay,
  median,
  parseRange,
  pct,
  ratioText,
  returnRate,
  stickiness,
  windowDays,
} from "./analytics-math";

describe("range", () => {
  it("accepts 7, 30 and 90 and falls back to 30", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange(["90"])).toBe(90);
    expect(parseRange("45")).toBe(30);
    expect(parseRange(undefined)).toBe(30);
  });

  it("lists the window oldest first, ending today, across a month end", () => {
    expect(windowDays(3, "2026-03-01")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  });

  it("zero-fills days with no rows and ignores days outside the window", () => {
    const days = windowDays(3, "2026-10-05");
    expect(
      fillDays(
        [
          { day: "2026-10-04", n: 2 },
          { day: "2026-09-01", n: 9 },
        ],
        days,
      ),
    ).toEqual([
      { day: "2026-10-03", n: 0 },
      { day: "2026-10-04", n: 2 },
      { day: "2026-10-05", n: 0 },
    ]);
  });
});

describe("local day bucketing", () => {
  it("puts the same instant on different days for different zones", () => {
    const at = new Date("2026-10-04T20:00:00Z");
    expect(localDay(at, "UTC")).toBe("2026-10-04");
    expect(localDay(at, "Asia/Kolkata")).toBe("2026-10-05");
    expect(localDay(at, "America/Los_Angeles")).toBe("2026-10-04");
  });

  it("uses UTC when the zone is missing or not a zone", () => {
    const at = new Date("2026-10-04T23:30:00Z");
    expect(localDay(at, null)).toBe("2026-10-04");
    expect(localDay(at, "")).toBe("2026-10-04");
    expect(localDay(at, "Not/AZone")).toBe("2026-10-04");
  });
});

describe("what counts", () => {
  it("counts every outcome but the two declarations as active", () => {
    expect(["correct", "wrong", "skipped"].every(isActiveOutcome)).toBe(true);
    expect(isActiveOutcome("new_to_me")).toBe(false);
    expect(isActiveOutcome("known")).toBe(false);
  });

  it("activates only on a right or wrong answer", () => {
    expect(isActivatingOutcome("correct")).toBe(true);
    expect(isActivatingOutcome("wrong")).toBe(true);
    expect(["skipped", "new_to_me", "known"].some(isActivatingOutcome)).toBe(false);
  });

  it("drops the e2e test accounts", () => {
    expect(isTestEmail("Admin-1@E2E.test")).toBe(true);
    expect(isTestEmail("a@example.com")).toBe(false);
    expect(isTestEmail(null)).toBe(false);
  });
});

describe("rates", () => {
  it("is a dash, not 0%, when there is nothing to divide by", () => {
    expect(pct(0, 0)).toBeNull();
    expect(ratioText(activation(0, 0))).toBe("no data yet");
  });

  it("shows the count beside the percentage", () => {
    expect(ratioText(activation(3, 8))).toBe("3 of 8 (38%)");
    expect(ratioText(activation(1, 1))).toBe("1 of 1 (100%)");
  });

  it("leaves skips out of accuracy", () => {
    expect(accuracy(3, 1).pct).toBe(75);
    expect(accuracy(0, 0).pct).toBeNull();
  });

  it("takes the median of odd, even and empty lists", () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([9, 1, 5])).toBe(5);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("measures stickiness as average daily actives over weekly actives", () => {
    expect(stickiness([2, 2, 2, 2, 2, 2, 2], 4)).toBe(50);
    expect(stickiness([7, 0, 0, 0, 0, 0, 0], 7)).toBe(14);
    expect(stickiness([], 0)).toBeNull();
  });

  it("reads minutes the way a person would", () => {
    expect(formatMinutes(null)).toBe("none yet");
    expect(formatMinutes(0.2)).toBe("under a minute");
    expect(formatMinutes(42)).toBe("42 min");
    expect(formatMinutes(190)).toBe("3 h 10 min");
    expect(formatMinutes(52 * 60)).toBe("2 d 4 h");
  });
});

describe("day-N return", () => {
  const today = "2026-10-10";

  it("judges a cohort only once its Nth day has fully passed", () => {
    expect(isMature("2026-10-09", 1, today)).toBe(false);
    expect(isMature("2026-10-08", 1, today)).toBe(true);
    expect(isMature("2026-10-03", 7, today)).toBe(false);
    expect(isMature("2026-10-02", 7, today)).toBe(true);
  });

  it("counts returns over mature cohorts only, so a young cohort is not a failure", () => {
    const cohorts = [
      { day: "2026-10-01", size: 5, d1: 2, d7: 1 },
      { day: "2026-10-08", size: 3, d1: 1, d7: 0 },
      { day: "2026-10-09", size: 4, d1: 4, d7: 4 },
    ];
    expect(returnRate(cohorts, 1, today)).toEqual({ part: 3, whole: 8, pct: 38 });
    expect(returnRate(cohorts, 7, today)).toEqual({ part: 1, whole: 5, pct: 20 });
  });

  it("handles a cohort of one and no cohorts", () => {
    expect(returnRate([{ day: "2026-10-01", size: 1, d1: 1, d7: 0 }], 1, today)).toEqual({ part: 1, whole: 1, pct: 100 });
    expect(returnRate([], 7, today)).toEqual({ part: 0, whole: 0, pct: null });
  });

  it("crosses a month end when finding the Nth day", () => {
    expect(isMature("2026-09-30", 7, "2026-10-07")).toBe(false);
    expect(isMature("2026-09-30", 7, "2026-10-08")).toBe(true);
  });
});

const gate = (today: string, returners: number) => launchGate({ launchDate: "2026-10-12", today, returners });

describe("launch gate", () => {
  it("day 0 is the launch day: pace 0, so zero returners is on track", () => {
    expect(gate("2026-10-12", 0)).toEqual({ dayOf30: 0, returners: 0, pace: 0, state: "on-track" });
  });

  it("a launch date in the future counts as day 0 and never goes negative", () => {
    expect(gate("2026-10-05", 0)).toEqual({ dayOf30: 0, returners: 0, pace: 0, state: "on-track" });
  });

  it("pace is 0 through day 7, so zero returners is on track before one can exist", () => {
    for (let d = 12; d <= 19; d++) expect(gate(`2026-10-${d}`, 0)).toEqual({ dayOf30: d - 12, returners: 0, pace: 0, state: "on-track" });
    expect(gate("2026-10-18", 0)).toMatchObject({ dayOf30: 6, pace: 0, state: "on-track" });
  });

  it("then paces linearly, rounding up: day 8 is 1, day 9 is 2, day 15 is 7, day 30 is 20", () => {
    expect(gate("2026-10-20", 0).pace).toBe(1);
    expect(gate("2026-10-21", 0).pace).toBe(2);
    expect(gate("2026-10-27", 0).pace).toBe(7);
    expect(gate("2026-11-11", 0).pace).toBe(20);
  });

  it("exactly on pace is on track; one under is behind (day 9, pace 2)", () => {
    expect(gate("2026-10-21", 2).state).toBe("on-track");
    expect(gate("2026-10-21", 1).state).toBe("behind");
    expect(gate("2026-10-21", 7)).toMatchObject({ dayOf30: 9, pace: 2, state: "on-track" });
  });

  it("being past the target before the window ends is still on track", () => {
    expect(gate("2026-10-21", 25).state).toBe("on-track");
    expect(gate("2026-11-10", 20).state).toBe("on-track");
  });

  it("day 29 is still open", () => {
    expect(gate("2026-11-10", 19)).toMatchObject({ dayOf30: 29, pace: 20, state: "behind" });
  });

  it("day 30 closes the window: below the target is closed-below, at the target is closed-met", () => {
    expect(gate("2026-11-11", 19)).toMatchObject({ dayOf30: 30, pace: 20, state: "closed-below" });
    expect(gate("2026-11-11", 20)).toMatchObject({ dayOf30: 30, state: "closed-met" });
  });

  it("day 31 and later stay closed and the day stops at 30", () => {
    expect(gate("2026-11-12", 7)).toMatchObject({ dayOf30: 30, pace: 20, state: "closed-below" });
    expect(gate("2027-03-01", 21)).toMatchObject({ dayOf30: 30, state: "closed-met" });
  });
});

describe("dashboard cache", () => {
  it("keys on the range and the launch date", () => {
    expect(analyticsCacheKey(30, "2026-10-14")).toBe("90x:analytics:30:2026-10-14");
    expect(analyticsCacheKey(30, null)).toBe("90x:analytics:30:no-launch");
    expect(analyticsCacheKey(30, "2026-10-14")).not.toBe(analyticsCacheKey(30, "2026-10-15"));
    expect(analyticsCacheKey(7, null)).not.toBe(analyticsCacheKey(30, null));
  });
  it("serves a hit only for the same range and launch date", () => {
    expect(isCachedFor({ range: 30, gate: { launchDate: "2026-10-14" } }, 30, "2026-10-14")).toBe(true);
    expect(isCachedFor({ range: 30, gate: { launchDate: "2026-10-14" } }, 30, "2026-10-20")).toBe(false);
    expect(isCachedFor({ range: 30, gate: { launchDate: "2026-10-14" } }, 30, null)).toBe(false);
    expect(isCachedFor({ range: 7, gate: null }, 30, null)).toBe(false);
  });
  it("drops a payload cached before the gate existed once a date is set, and keeps it while none is", () => {
    expect(isCachedFor({ range: 30 }, 30, "2026-10-14")).toBe(false);
    expect(isCachedFor({ range: 30 }, 30, null)).toBe(true);
    expect(isCachedFor(null, 30, null)).toBe(false);
  });
});
