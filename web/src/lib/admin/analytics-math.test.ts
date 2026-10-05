import { describe, expect, it } from "vitest";
import {
  accuracy,
  activation,
  fillDays,
  formatMinutes,
  isActiveOutcome,
  isActivatingOutcome,
  isMature,
  isTestEmail,
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
