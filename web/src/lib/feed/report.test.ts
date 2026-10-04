import { describe, expect, it } from "vitest";
import { comparisonLine, fillDays, lastSevenDays, percent, visibleAreas, weekday } from "./report";

describe("percent", () => {
  it("is null when nothing was answered and rounds otherwise", () => {
    expect(percent({ answered: 0, correct: 0 })).toBeNull();
    expect(percent({ answered: 3, correct: 2 })).toBe(67);
  });
});

describe("comparisonLine", () => {
  const life = { answered: 100, correct: 70 };
  it("says so when nothing was answered today", () => {
    expect(comparisonLine({ answered: 0, correct: 0 }, life)).toBe("No answers yet today.");
  });
  it("compares today to the lifetime rate in points", () => {
    expect(comparisonLine({ answered: 10, correct: 8 }, life)).toBe("Today is 10 points above your lifetime rate of 70%.");
    expect(comparisonLine({ answered: 10, correct: 6 }, life)).toBe("Today is 10 points below your lifetime rate of 70%.");
    expect(comparisonLine({ answered: 10, correct: 7 }, life)).toBe("Today matches your lifetime rate of 70%.");
    expect(comparisonLine({ answered: 100, correct: 71 }, life)).toBe("Today is 1 point above your lifetime rate of 70%.");
  });
});

describe("visibleAreas", () => {
  it("drops areas under three graded answers and keeps the app's order", () => {
    const rows = [
      { area: "sql", answered: 5, correct: 4 },
      { area: "dsa", answered: 2, correct: 2 },
      { area: "cs", answered: 3, correct: 1 },
    ] as const;
    expect(visibleAreas([...rows]).map((r) => r.area)).toEqual(["cs", "sql"]);
  });
});

describe("days", () => {
  it("counts back seven local dates across a month boundary", () => {
    expect(lastSevenDays("2026-03-02")).toEqual([
      "2026-02-24",
      "2026-02-25",
      "2026-02-26",
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
  });
  it("fills days with no answers and never reorders", () => {
    const days = fillDays("2026-10-03", [{ day: "2026-10-01", answered: 4, correct: 3 }]);
    expect(days).toHaveLength(7);
    expect(days[6]).toEqual({ day: "2026-10-03", answered: 0, correct: 0 });
    expect(days[4]).toEqual({ day: "2026-10-01", answered: 4, correct: 3 });
  });
  it("names the weekday of a date", () => {
    expect(weekday("2026-10-03")).toBe("Sat");
  });
});
