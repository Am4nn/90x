import { describe, expect, it } from "vitest";
import { weekSeries } from "./series";

describe("weekSeries", () => {
  it("returns Monday to Sunday of today's week, with zeros for quiet days and the days still to come marked", () => {
    // 2026-10-08 is a Thursday.
    const series = weekSeries(
      [
        { day: "2026-10-08", xp: 40 },
        { day: "2026-10-06", xp: 15 },
      ],
      "2026-10-08",
    );
    expect(series.map((d) => d.date)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    expect(series.map((d) => d.xp)).toEqual([0, 15, 0, 40, 0, 0, 0]);
    expect(series.map((d) => d.future)).toEqual([false, false, false, false, true, true, true]);
  });

  it("on a Sunday the whole week is past, and a Monday starts a new one", () => {
    expect(weekSeries([], "2026-10-11").every((d) => !d.future)).toBe(true);
    const monday = weekSeries([{ day: "2026-10-11", xp: 9 }], "2026-10-12");
    expect(monday[0]?.date).toBe("2026-10-12");
    expect(monday.reduce((n, d) => n + d.xp, 0)).toBe(0);
  });

  it("adds rows that share a day and ignores days outside the week", () => {
    const series = weekSeries(
      [
        { day: "2026-10-05", xp: 2 },
        { day: "2026-10-05", xp: 3 },
        { day: "2026-09-20", xp: 99 },
      ],
      "2026-10-05",
    );
    expect(series[0]?.xp).toBe(5);
    expect(series.reduce((n, d) => n + d.xp, 0)).toBe(5);
  });
});
