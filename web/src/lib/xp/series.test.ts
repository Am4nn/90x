import { describe, expect, it } from "vitest";
import { weekSeries } from "./series";

describe("weekSeries", () => {
  it("returns seven days ending today, oldest first, with zeros for quiet days", () => {
    const series = weekSeries(
      [
        { day: "2026-10-05", xp: 40 },
        { day: "2026-10-01", xp: 15 },
      ],
      "2026-10-05",
    );
    expect(series.map((d) => d.date)).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
    ]);
    expect(series.map((d) => d.xp)).toEqual([0, 0, 15, 0, 0, 0, 40]);
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
    expect(series.at(-1)?.xp).toBe(5);
    expect(series.reduce((n, d) => n + d.xp, 0)).toBe(5);
  });
});
