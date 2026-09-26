import { describe, expect, it } from "vitest";
import { layoutMap, masteryState } from "./map-layout";

const nodes = ["a", "b", "c", "d", "e"].map((slug) => ({ slug, name: slug.toUpperCase() }));
const links = [
  { from: "a", to: "b" }, { from: "a", to: "c" }, { from: "b", to: "d" }, { from: "c", to: "d" }, { from: "d", to: "e" },
];

describe("layoutMap", () => {
  it("puts each node one layer below its deepest prerequisite", () => {
    const { positions } = layoutMap(nodes, links);
    const layer = (s: string) => positions[s].layer;
    expect([layer("a"), layer("b"), layer("c"), layer("d"), layer("e")]).toEqual([0, 1, 1, 2, 3]);
  });
  it("keeps every node inside the drawing and nodes in a layer apart", () => {
    const { positions, width, height } = layoutMap(nodes, links);
    for (const p of Object.values(positions)) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(height);
    }
    expect(positions.b.x).not.toBe(positions.c.x);
  });
  it("places unlinked nodes too", () => {
    const { positions } = layoutMap([...nodes, { slug: "z", name: "Z" }], links);
    expect(positions.z.layer).toBe(0);
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
