import { describe, expect, it } from "vitest";
import { layoutMark, MARK_BOX, MARK_STROKE, markScale } from "./mark";

// Roughly Sora 700 at 38px.
const metrics = { inkLeft: 1.5, inkRight: 49.5, capHeight: 27, xHeight: 20 };

describe("layoutMark", () => {
  const layout = layoutMark(metrics);

  it("centres the ink of 90 + gap + x horizontally", () => {
    expect(layout.width).toBeCloseTo(48 + 38 * 0.14 + 20);
    expect(layout.left + layout.width / 2).toBeCloseTo(MARK_BOX / 2);
    expect(layout.textX + metrics.inkLeft).toBeCloseTo(layout.left);
  });

  it("centres the cap height of 90 vertically", () => {
    expect(layout.baseline - metrics.capHeight / 2).toBeCloseTo(MARK_BOX / 2);
  });

  it("draws the x as a square of x-height on the baseline, caps included", () => {
    const [one, two] = layout.strokes;
    const half = MARK_STROKE / 2;
    expect(one.x1 - half).toBeCloseTo(layout.left + 48 + 38 * 0.14);
    expect(two.x1 + half).toBeCloseTo(layout.left + layout.width);
    expect(one.y1 - half).toBeCloseTo(layout.baseline - metrics.xHeight);
    expect(one.y2 + half).toBeCloseTo(layout.baseline);
    expect(two).toEqual({ x1: one.x2, y1: one.y1, x2: one.x1, y2: one.y2 });
  });
});

describe("markScale", () => {
  it("scales the mark to a fraction of the box", () => {
    expect(markScale(80, 0.4)).toBeCloseTo(0.5);
  });
});
