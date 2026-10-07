import { describe, expect, it } from "vitest";
import { GRID_AREA, gridLayout } from "./grid";

describe("gridLayout", () => {
  it.each([7, 30, 60, 90])("keeps the approved 10-column, 44px grid for %i days", (n) => {
    expect(gridLayout(n)).toMatchObject({ cols: 10, sq: 44, gap: 8, rows: Math.ceil(n / 10) });
  });

  it("is exactly the 512x460 area at 90 days", () => {
    expect(gridLayout(90)).toMatchObject({ width: GRID_AREA.width, height: GRID_AREA.height });
  });

  it.each([91, 100, 120, 180, 200, 300, 365])("fits %i squares inside the area, never under 10px", (n) => {
    const g = gridLayout(n);
    expect(g.cols * g.rows).toBeGreaterThanOrEqual(n);
    expect(g.width).toBeLessThanOrEqual(GRID_AREA.width);
    expect(g.height).toBeLessThanOrEqual(GRID_AREA.height);
    expect(g.sq).toBeGreaterThanOrEqual(10);
    expect(g.sq).toBeLessThanOrEqual(44);
  });

  it("uses more columns as the campaign grows", () => {
    expect(gridLayout(120).cols).toBeGreaterThan(10);
    expect(gridLayout(365).cols).toBeGreaterThan(gridLayout(120).cols);
  });
});
