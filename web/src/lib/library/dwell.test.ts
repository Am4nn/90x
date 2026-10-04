import { describe, expect, it } from "vitest";
import { dwellMs, OPENED_MS, visibleClock } from "./dwell";

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

describe("visibleClock", () => {
  it("counts only the time between resume and pause", () => {
    const clock = visibleClock();
    clock.resume(1_000);
    clock.pause(31_000);
    // Hidden for a long while: none of it counts.
    clock.resume(500_000);
    expect(clock.elapsed(520_000)).toBe(50_000);
    expect(clock.elapsed(530_000)).toBeGreaterThanOrEqual(OPENED_MS);
  });

  it("ignores a second resume or pause in a row", () => {
    const clock = visibleClock();
    clock.resume(0);
    clock.resume(10_000);
    clock.pause(20_000);
    clock.pause(90_000);
    expect(clock.elapsed(100_000)).toBe(20_000);
  });

  it("starts at zero", () => {
    expect(visibleClock().elapsed(5_000)).toBe(0);
  });
});
