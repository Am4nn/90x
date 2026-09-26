import { describe, expect, it } from "vitest";
import { band, dsaArea, overall, topicArea } from "./readiness";

const important = [
  { slug: "a", importance: 1 },
  { slug: "b", importance: 1 },
  { slug: "c", importance: 2 },
];

describe("dsaArea", () => {
  it("has no score before any attempt", () => {
    expect(dsaArea(important, [], "2026-09-27").score).toBeNull();
  });

  it("coverage is importance-weighted; accuracy counts solved 1, hints 0.5, failed 0", () => {
    const got = dsaArea(
      important,
      [
        { slug: "c", result: "solved", date: "2026-08-01" },
        { slug: "a", result: "hints", date: "2026-08-01" },
      ],
      "2026-09-27",
    );
    expect(got.coverage).toBeCloseTo(3 / 4);
    expect(got.accuracy).toBeCloseTo(0.75);
    expect(got.score).toBe(56);
  });

  it("the last 14 days count double", () => {
    const got = dsaArea(
      important,
      [
        { slug: "a", result: "failed", date: "2026-08-01" },
        { slug: "b", result: "solved", date: "2026-09-20" },
      ],
      "2026-09-27",
    );
    expect(got.accuracy).toBeCloseTo(2 / 3);
  });

  it("attempts on unimportant problems add accuracy but not coverage", () => {
    const got = dsaArea(important, [{ slug: "zzz", result: "solved", date: "2026-09-27" }], "2026-09-27");
    expect(got.coverage).toBe(0);
    expect(got.score).toBe(0);
  });
});

describe("topicArea", () => {
  it("reports coverage but no score until card answers exist", () => {
    const got = topicArea(
      [
        { slug: "x", importance: 1 },
        { slug: "y", importance: 3 },
      ],
      new Set(["y"]),
    );
    expect(got.coverage).toBeCloseTo(0.75);
    expect(got.score).toBeNull();
  });
});

describe("overall", () => {
  it("is the weighted mean of areas that have a score", () => {
    expect(overall({ dsa: 60, system_design: null, cs: null, java: 40, sql: null })).toBe(Math.round((60 * 35 + 40 * 15) / 50));
  });

  it("is null with no data", () => {
    expect(overall({ dsa: null, system_design: null })).toBeNull();
  });
});

describe("band", () => {
  it("red under 40, yellow to 69, green from 70", () => {
    expect(band(39)).toBe("bad");
    expect(band(40)).toBe("warn");
    expect(band(69)).toBe("warn");
    expect(band(70)).toBe("ok");
  });
});
