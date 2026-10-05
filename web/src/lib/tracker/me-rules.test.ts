import { describe, expect, it } from "vitest";
import { weakestPatterns, withTodayPoint } from "./me-rules";

const p = (slug: string, solved: number, failed: number, total = 10) => ({
  slug,
  name: slug,
  solved,
  failed,
  total,
  state: "started" as const,
});

describe("weakestPatterns", () => {
  it("ranks attempted patterns by success rate, lowest first", () => {
    const got = weakestPatterns([p("a", 5, 0), p("b", 1, 3), p("c", 2, 2), p("d", 0, 0)], 2);
    expect(got.map((x) => x.slug)).toEqual(["b", "c"]);
  });

  it("ignores patterns never tried", () => {
    expect(weakestPatterns([p("d", 0, 0)], 3)).toEqual([]);
  });

  it("describes each one", () => {
    expect(weakestPatterns([p("b", 1, 3)], 1)[0]?.detail).toBe("1 solved, 3 failed");
  });
});

describe("withTodayPoint", () => {
  const today = "2026-10-05";
  it("replaces a stored point for today with the fresh value", () => {
    const stored = [
      { date: "2026-10-03", overall: 40 },
      { date: today, overall: 41 },
    ];
    expect(withTodayPoint(stored, today, 45)).toEqual([
      { date: "2026-10-03", overall: 40 },
      { date: today, overall: 45 },
    ]);
  });

  it("adds today in date order when it wasn't stored yet", () => {
    expect(withTodayPoint([{ date: "2026-10-03", overall: 40 }], today, 45)).toEqual([
      { date: "2026-10-03", overall: 40 },
      { date: today, overall: 45 },
    ]);
    expect(withTodayPoint([], today, null)).toEqual([{ date: today, overall: null }]);
    // A point after today (a time zone moved back) stays after it.
    expect(withTodayPoint([{ date: "2026-10-06", overall: 50 }], today, 45).map((point) => point.date)).toEqual([today, "2026-10-06"]);
  });
});
