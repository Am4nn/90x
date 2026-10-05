import { describe, expect, it } from "vitest";
import { arc, clamp01, easeFactor, easeInOut, perimeter, smoothstep, thin, wrap01 } from "./particle-math";
import { seeded } from "./rng";

describe("seeded", () => {
  it("gives the same numbers for the same seed, and different ones for another", () => {
    const a = seeded(1337);
    const b = seeded(1337);
    const first = [a(), a(), a(), a()];
    expect([b(), b(), b(), b()]).toEqual(first);
    expect(seeded(1338)()).not.toBe(first[0]);
  });

  it("stays in 0 to 1 and spreads out", () => {
    const random = seeded(1);
    const values = Array.from({ length: 5000 }, () => random());
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it("is the designer's generator, number for number (the design prototype's own mulberry32)", () => {
    // Copied from the approved design, so the particles start where the design's did.
    let seed = 1337;
    const prototype = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const mine = seeded(1337);
    for (let i = 0; i < 50; i++) expect(mine()).toBe(prototype());
  });
});

describe("easing", () => {
  it("easeInOut is 0 at 0, 1 at 1, and a half at the middle", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(0.25)).toBeLessThan(0.25);
    expect(easeInOut(0.75)).toBeGreaterThan(0.75);
  });

  it("smoothstep is 0 below, 1 above, and S-shaped between", () => {
    expect(smoothstep(0.2, 0.4, 0.1)).toBe(0);
    expect(smoothstep(0.2, 0.4, 0.5)).toBe(1);
    expect(smoothstep(0.2, 0.4, 0.3)).toBeCloseTo(0.5);
  });

  it("easeFactor closes 63% of the gap in one time constant", () => {
    expect(easeFactor(80, 80)).toBeCloseTo(0.632, 3);
    expect(easeFactor(0, 80)).toBe(0);
  });

  it("clamp01 and wrap01", () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(3)).toBe(1);
    expect(wrap01(1.25)).toBeCloseTo(0.25);
    expect(wrap01(-0.25)).toBeCloseTo(0.75);
  });
});

describe("perimeter", () => {
  it("starts at the top left and goes clockwise round a box", () => {
    // A 100 by 50 box at (10, 20): a quarter of the way is 75px along, which is the top edge's 100 minus... check each corner.
    expect(perimeter(10, 20, 100, 50, 0)).toEqual([10, 20]);
    expect(perimeter(10, 20, 100, 50, 100 / 300)).toEqual([110, 20]);
    expect(perimeter(10, 20, 100, 50, 150 / 300)).toEqual([110, 70]);
    const bottomLeft = perimeter(10, 20, 100, 50, 250 / 300);
    expect(bottomLeft[0]).toBeCloseTo(10);
    expect(bottomLeft[1]).toBeCloseTo(70);
  });

  it("comes back round to where it started", () => {
    const end = perimeter(10, 20, 100, 50, 0.9999);
    expect(end[0]).toBeCloseTo(10, 1);
    expect(end[1]).toBeCloseTo(20, 1);
  });
});

describe("arc", () => {
  it("starts and ends where it is told and bows sideways in between", () => {
    expect(arc(0, 0, 100, 0, 1, 0)).toEqual([0, 0]);
    const end = arc(0, 0, 100, 0, 1, 1);
    expect(end[0]).toBeCloseTo(100);
    expect(end[1]).toBeCloseTo(0);
    const middle = arc(0, 0, 100, 0, 1, 0.5);
    expect(middle[0]).toBeCloseTo(50);
    expect(Math.abs(middle[1])).toBeGreaterThan(5);
    // No bend, no bow: it is the straight line.
    expect(arc(0, 0, 100, 0, 0, 0.5)[1]).toBeCloseTo(0);
  });
});

describe("thin", () => {
  it("keeps 70% of the items, spread evenly", () => {
    const kept = thin(1000, 0.7);
    expect(kept.filter(Boolean)).toHaveLength(700);
    // No bare patch: in any window of ten, between six and eight are kept.
    for (let i = 0; i + 10 <= kept.length; i += 10) {
      const n = kept.slice(i, i + 10).filter(Boolean).length;
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(8);
    }
  });

  it("keeps everything at 1 and nothing at 0", () => {
    expect(thin(5, 1)).toEqual([true, true, true, true, true]);
    expect(thin(5, 0)).toEqual([false, false, false, false, false]);
  });
});
