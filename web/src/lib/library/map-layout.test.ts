import { describe, expect, it } from "vitest";
import { ancestors, DOT, edgePath, layoutPatternMap, MAP_WINDOW, masteryState, NODE_H, patternTiers, windowShift } from "./map-layout";

// The design mock's own graph (RAW tiers and LINKS), so the port is checked
// against the numbers the mock draws.
const MOCK_LINKS =
  "ah>tp ah>st ah>ps ah>str ah>mg ah>sim tp>bs tp>sw tp>ll str>sw bs>tr ll>tr tr>tri tr>hp tr>bt ps>seg tr>seg bt>gr mg>gr bt>dp1 hp>gd hp>iv seg>ds ll>ds hp>ag gr>ag gr>dp2 dp1>dp2 dp1>bit gr>mth bit>mth"
    .split(" ")
    .map((s) => {
      const [from, to] = s.split(">");
      return { from: from!, to: to! };
    });
const MOCK_TIERS: [string, number][] = [
  ["ah", 0],
  ["tp", 1],
  ["st", 1],
  ["ps", 1],
  ["str", 1],
  ["mg", 1],
  ["sim", 1],
  ["bs", 2],
  ["sw", 2],
  ["ll", 2],
  ["tr", 3],
  ["tri", 4],
  ["hp", 4],
  ["bt", 4],
  ["seg", 4],
  ["gr", 5],
  ["dp1", 5],
  ["gd", 5],
  ["iv", 5],
  ["ds", 5],
  ["ag", 6],
  ["dp2", 6],
  ["bit", 6],
  ["mth", 7],
];
const SLUGS = MOCK_TIERS.map(([s]) => s);

describe("patternTiers", () => {
  it("puts each pattern one stage below its deepest prerequisite, which is the mock's staging", () => {
    const tiers = patternTiers(SLUGS, MOCK_LINKS);
    expect(SLUGS.map((s) => [s, tiers.get(s)])).toEqual(MOCK_TIERS);
  });

  it("survives a cycle and ignores links to unknown patterns", () => {
    const tiers = patternTiers(
      ["a", "b"],
      [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
        { from: "x", to: "a" },
      ],
    );
    expect([...tiers.keys()].toSorted()).toEqual(["a", "b"]);
  });
});

describe("layoutPatternMap", () => {
  const tiers = patternTiers(SLUGS, MOCK_LINKS);

  it.each([
    [672, 5],
    [560, 5],
    [476, 4],
    [400, 4],
    [324, 3],
  ])("at %ipx uses %i columns", (width, cols) => {
    const { positions } = layoutPatternMap(SLUGS, tiers, width, false);
    // Arrays & Hashing is alone on its stage: centred, one column wide.
    expect(positions.ah!.x).toBeCloseTo(width / 2);
    expect(positions.ah!.w).toBe(Math.floor(width / cols - 6));
  });

  it("matches the mock's desktop drawing at 672px", () => {
    const { positions, height } = layoutPatternMap(SLUGS, tiers, 672, false);
    // Stage 1 has six patterns on five columns: two staggered rows of three.
    const stage1 = ["tp", "st", "ps", "str", "mg", "sim"].map((s) => positions[s]!);
    expect(stage1.map((p) => p.y)).toEqual([99, 99, 99, 178, 178, 178]);
    const cw = Math.min(672 / 5, 672 / 3.5);
    expect(stage1[0]!.x).toBeCloseTo((672 - 3.5 * cw) / 2 + 0.5 * cw);
    expect(stage1[3]!.x - stage1[0]!.x).toBeCloseTo(cw / 2);
    // Nine rows (eight stages, stage 1 wrapped once): 65px nodes, 34px between stages, 14px within one.
    expect(height).toBe(NODE_H * 9 + 34 * 7 + 14);
  });

  it("never lets two dots in a row overlap, and keeps every dot inside the box", () => {
    for (const width of [324, 476, 672]) {
      const { positions } = layoutPatternMap(SLUGS, tiers, width, width < 400);
      const placed = Object.values(positions);
      expect(placed).toHaveLength(SLUGS.length);
      for (const p of placed) {
        expect(p.x - DOT / 2).toBeGreaterThanOrEqual(0);
        expect(p.x + DOT / 2).toBeLessThanOrEqual(width);
      }
      for (const a of placed) for (const b of placed) if (a !== b && a.y === b.y) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(DOT);
    }
  });

  it("spaces stages closer on a phone", () => {
    const desk = layoutPatternMap(SLUGS, tiers, 324, false).height;
    const phone = layoutPatternMap(SLUGS, tiers, 324, true).height;
    expect(desk - phone).toBe(8 * 7);
  });
});

describe("edgePath", () => {
  it("runs from dot centre to dot centre with a vertical S curve", () => {
    expect(edgePath({ x: 10, y: 0, w: 0 }, { x: 50, y: 100, w: 0 })).toBe("M10 14 C10 64 50 64 50 114");
  });
});

describe("ancestors", () => {
  it("collects every prerequisite on the way up", () => {
    expect([...ancestors("tr", MOCK_LINKS)].toSorted()).toEqual(["ah", "bs", "ll", "tp"]);
  });
});

describe("windowShift", () => {
  it("centres the selected dot in the phone window, clamped to the map", () => {
    const full = 1000;
    expect(windowShift(full, 0, true)).toBe(0);
    expect(windowShift(full, 500, true)).toBe(-(500 - MAP_WINDOW / 2 + NODE_H / 2));
    expect(windowShift(full, 990, true)).toBe(-(full - MAP_WINDOW));
  });

  it("does not move a map that is not capped or already fits", () => {
    expect(windowShift(1000, 500, false)).toBe(0);
    expect(windowShift(300, 200, true)).toBe(0);
  });
});

describe("masteryState", () => {
  it("classifies by solved share and flags weakness from failures", () => {
    expect(masteryState({ total: 10, solved: 0, failed: 0 })).toBe("untouched");
    expect(masteryState({ total: 10, solved: 3, failed: 0 })).toBe("started");
    expect(masteryState({ total: 10, solved: 7, failed: 1 })).toBe("mastered");
    expect(masteryState({ total: 10, solved: 2, failed: 3 })).toBe("weak");
  });
});
