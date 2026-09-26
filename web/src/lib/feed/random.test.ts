import { describe, expect, it } from "vitest";
import { seededRandom, shuffled } from "./random";

describe("seededRandom", () => {
  it("repeats for a seed and stays in [0, 1)", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const values = Array.from({ length: 100 }, () => a());
    expect(values).toEqual(Array.from({ length: 100 }, () => b()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});

describe("shuffled", () => {
  const items = Array.from({ length: 20 }, (_, i) => i);

  it("is a permutation and leaves the input alone", () => {
    const copy = [...items];
    const result = shuffled(items, 1);
    expect(result.toSorted((a, b) => a - b)).toEqual(items);
    expect(items).toEqual(copy);
  });

  it("is deterministic per seed and differs across seeds", () => {
    expect(shuffled(items, 7)).toEqual(shuffled(items, 7));
    expect(shuffled(items, 7)).not.toEqual(shuffled(items, 8));
  });
});
