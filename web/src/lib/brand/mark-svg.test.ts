import { describe, expect, it } from "vitest";
import { markSvg } from "./mark-svg";

const geometry = {
  ninety: "M10 60L20 40Z",
  width: 80,
  strokes: [
    { x1: 70, y1: 45, x2: 85, y2: 60 },
    { x1: 85, y1: 45, x2: 70, y2: 60 },
  ] as const,
};

describe("markSvg", () => {
  it("draws 90 as a path and the x as two round-capped strokes", () => {
    const svg = markSvg(geometry, { size: 32, tile: "rounded" });
    expect(svg).toContain('width="32" height="32" viewBox="0 0 100 100"');
    expect(svg).toContain('d="M10 60L20 40Z"');
    expect(svg.match(/<line /g)).toHaveLength(2);
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).not.toContain("<text");
  });

  it("rounds the tile, fills it edge to edge, or leaves it out", () => {
    expect(markSvg(geometry, { size: 100, tile: "rounded" })).toContain('rx="22"');
    expect(markSvg(geometry, { size: 100, tile: "square" })).toMatch(/<rect width="100" height="100" fill="#0a0c10"\/>/);
    expect(markSvg(geometry, { size: 100, tile: "none" })).not.toContain("<rect");
  });

  it("scales about the centre to span a fraction of the box", () => {
    expect(markSvg(geometry, { size: 100, tile: "square", fraction: 0.4 })).toContain(
      'transform="translate(50 50) scale(0.5) translate(-50 -50)"',
    );
    expect(markSvg(geometry, { size: 100, tile: "square" })).not.toContain("transform");
  });
});
