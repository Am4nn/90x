import { describe, expect, it } from "vitest";
import { dropIndex, placeAt, refill, scrollDirection, sideOf, without } from "./drag";

describe("placeAt", () => {
  it("inserts a new item and shifts the rest", () => {
    expect(placeAt([1, 2, 3], 9, 1)).toEqual([1, 9, 2, 3]);
  });
  it("moves an item already in the list to the index it will end up at", () => {
    expect(placeAt([1, 2, 3, 4], 1, 2)).toEqual([2, 3, 1, 4]);
    expect(placeAt([1, 2, 3, 4], 4, 0)).toEqual([4, 1, 2, 3]);
  });
  it("clamps an index past the end to the end", () => {
    expect(placeAt([1, 2], 9, 7)).toEqual([1, 2, 9]);
    expect(placeAt([1, 2], 9, -3)).toEqual([9, 1, 2]);
  });
});

describe("without", () => {
  it("drops the item", () => {
    expect(without([1, 2, 3], 2)).toEqual([1, 3]);
  });
});

describe("drop geometry", () => {
  it("reads the side from the midpoint", () => {
    expect(sideOf(10, 0, 40)).toBe("before");
    expect(sideOf(30, 0, 40)).toBe("after");
  });
  it("counts a drop after a filled slot as the next slot", () => {
    expect(dropIndex(2, "before", true)).toBe(2);
    expect(dropIndex(2, "after", true)).toBe(3);
    expect(dropIndex(2, "after", false)).toBe(2);
  });
  it("scrolls only within the edge band", () => {
    expect(scrollDirection(20, 800)).toBe(-1);
    expect(scrollDirection(790, 800)).toBe(1);
    expect(scrollDirection(400, 800)).toBe(0);
  });
});

describe("refill", () => {
  // A line of five slots; slots 1, 2 and 4 are gaps, 0 and 3 are fixed pieces.
  const gaps = [1, 2, 4];
  it("compacts placed pieces into the leftmost gaps after an insert", () => {
    expect(refill(gaps, [10, null, 5, 11, null], 7, 0)).toEqual([10, 7, 5, 11, null]);
  });
  it("takes a piece back out", () => {
    expect(refill(gaps, [10, 6, 5, 11, null], 6, null)).toEqual([10, 5, null, 11, null]);
  });
  it("leaves fixed pieces where they are", () => {
    const out = refill(gaps, [10, 6, null, 11, null], 8, 1);
    expect(out[0]).toBe(10);
    expect(out[3]).toBe(11);
    expect([out[1], out[2], out[4]]).toEqual([6, 8, null]);
  });
});
