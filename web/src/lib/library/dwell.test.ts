import { describe, expect, it } from "vitest";
import { dwellMs } from "./dwell";

describe("dwellMs", () => {
  it("scales with the lesson, so a long one asks for longer", () => {
    // 1,000 words is a 5 minute read at 200wpm; 40% of that is 2 minutes.
    expect(dwellMs(1000)).toBe(120_000);
    expect(dwellMs(600)).toBe(72_000);
    expect(dwellMs(1400)).toBe(168_000);
  });

  it("never drops below a floor, however short the lesson", () => {
    // Otherwise a stub lesson would mark itself studied almost on open.
    expect(dwellMs(10)).toBe(20_000);
    expect(dwellMs(0)).toBe(20_000);
  });

  it("is longer for a longer lesson", () => {
    expect(dwellMs(1400)).toBeGreaterThan(dwellMs(700));
  });
});
