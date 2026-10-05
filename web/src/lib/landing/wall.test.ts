import { describe, expect, it } from "vitest";
import { columnShift, COLUMN_SPEEDS, deal, drift, smoothSpeed, wallColumns } from "./wall";

describe("wallColumns", () => {
  it("is three columns from 980px and two below", () => {
    expect(wallColumns(979)).toBe(2);
    expect(wallColumns(980)).toBe(3);
    expect(wallColumns(1280)).toBe(3);
    expect(wallColumns(390)).toBe(2);
  });
});

describe("deal", () => {
  it("deals cards across the columns one at a time", () => {
    expect(deal([1, 2, 3, 4, 5, 6, 7, 8, 9], 3)).toEqual([
      [1, 4, 7],
      [2, 5, 8],
      [3, 6, 9],
    ]);
    expect(deal([1, 2, 3, 4, 5, 6, 7, 8, 9], 2)).toEqual([
      [1, 3, 5, 7, 9],
      [2, 4, 6, 8],
    ]);
  });
});

describe("drift", () => {
  it("moves 0.03px a millisecond when the page is still", () => {
    expect(drift(0, 1000, 0)).toBeCloseTo(30);
    expect(drift(100, 100, 0)).toBeCloseTo(103);
  });

  it("speeds up with the scroll, to at most 9 times as fast", () => {
    expect(drift(0, 1000, 10)).toBeCloseTo(30 * (1 + 3.5));
    expect(drift(0, 1000, 1000)).toBeCloseTo(30 * 9);
  });
});

describe("smoothSpeed", () => {
  it("blends a tenth of each frame's scroll into the last speed, capped at 40px", () => {
    expect(smoothSpeed(0, 10)).toBeCloseTo(1);
    expect(smoothSpeed(0, -10)).toBeCloseTo(1);
    expect(smoothSpeed(0, 500)).toBeCloseTo(4);
    expect(smoothSpeed(10, 0)).toBeCloseTo(9);
  });
});

describe("columnShift", () => {
  it("slides the first column up by a fraction of one set, wrapping before the set ends", () => {
    expect(columnShift(0, 0, 1000)).toBe(-0);
    expect(columnShift(0, 400, 1000)).toBe(-400);
    expect(columnShift(0, 1000, 1000)).toBe(-0);
  });

  it("runs the second column the other way, from a full set up", () => {
    expect(columnShift(1, 0, 1000)).toBe(-1000);
    expect(columnShift(1, 400, 1000)).toBeCloseTo(-1000 + 400 * COLUMN_SPEEDS[1]);
  });

  it("runs the third column a little faster than the first", () => {
    expect(columnShift(2, 400, 1000)).toBeCloseTo(-400 * 1.15);
  });

  it("is zero when the length is not known yet", () => {
    expect(columnShift(1, 400, 0)).toBe(0);
  });
});
