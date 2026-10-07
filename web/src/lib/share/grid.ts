// The share card's square grid. A campaign is 7 to 365 days, so the layout is chosen per total:
// up to 90 squares keep the approved 10-column, 44px layout; longer ones shrink inside the same
// area so the card's frame never changes.

export const GRID_AREA = { width: 512, height: 460 };
const BASE = { sq: 44, gap: 8, cols: 10 };
const MAX_BASE_TOTAL = 90;

export type GridLayout = { cols: number; rows: number; sq: number; gap: number; width: number; height: number };

const gapFor = (sq: number) => Math.max(2, Math.round((sq * BASE.gap) / BASE.sq));
const extent = (n: number, sq: number, gap: number) => n * sq + (n - 1) * gap;

function layoutFor(total: number, cols: number, sq: number): GridLayout {
  const gap = gapFor(sq);
  const rows = Math.ceil(total / cols);
  return { cols, rows, sq, gap, width: extent(cols, sq, gap), height: extent(rows, sq, gap) };
}

export function gridLayout(total: number): GridLayout {
  const n = Math.max(1, Math.trunc(total));
  if (n <= MAX_BASE_TOTAL) return layoutFor(n, BASE.cols, BASE.sq);
  let best: GridLayout | null = null;
  // Squares stay square: take the column count that lets the largest square fit the area.
  for (let cols = BASE.cols; cols <= n; cols++) {
    let sq = BASE.sq;
    while (sq > 1) {
      const g = layoutFor(n, cols, sq);
      if (g.width <= GRID_AREA.width && g.height <= GRID_AREA.height) break;
      sq--;
    }
    const g = layoutFor(n, cols, sq);
    if (!best || g.sq > best.sq) best = g;
  }
  return best as GridLayout;
}
