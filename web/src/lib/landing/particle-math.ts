// The small arithmetic the particle overlay is made of. Pure, so the shapes it draws
// (a point travelling round a box, an arc between two places) are checked without a canvas.

export type Point = readonly [number, number];

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Slow, fast, slow: the particles' way of travelling between sections. */
export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** 0 below `from`, 1 above `to`, a smooth S between. */
export function smoothstep(from: number, to: number, value: number): number {
  const x = clamp01((value - from) / (to - from));
  return x * x * (3 - 2 * x);
}

/** How far a value that eases towards its target covers in `dt` ms, if it closes 63% of the gap every `tau` ms. */
export const easeFactor = (dt: number, tau: number): number => 1 - Math.exp(-dt / tau);

/**
 * A point on the outline of a box, `u` of the way round it (0 to 1, starting at the top left
 * and going clockwise). Values outside 0 to 1 are not wrapped: callers pass `((u % 1) + 1) % 1`.
 */
export function perimeter(x: number, y: number, w: number, h: number, u: number): Point {
  let along = u * 2 * (w + h);
  if (along < w) return [x + along, y];
  along -= w;
  if (along < h) return [x + w, y + along];
  along -= h;
  if (along < w) return [x + w - along, y + h];
  along -= w;
  return [x, y + h - along];
}

export const wrap01 = (u: number): number => ((u % 1) + 1) % 1;

/** A point `t` of the way along a curve from (x0, y0) to (x1, y1), bowed sideways by `bend` (-1 to 1). */
export function arc(x0: number, y0: number, x1: number, y1: number, bend: number, t: number): Point {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const cx = (x0 + x1) / 2 - dy * 0.35 * bend;
  const cy = (y0 + y1) / 2 + dx * 0.35 * bend;
  const m = 1 - t;
  return [m * m * x0 + 2 * m * t * cx + t * t * x1, m * m * y0 + 2 * m * t * cy + t * t * y1];
}

/**
 * Which of `total` items to keep to thin them to `ratio`, evenly: item i is kept when the
 * running count crosses a whole number. Used to cut the phone's particles by 30% without
 * leaving a bare patch in the letters.
 */
export function thin(total: number, ratio: number): boolean[] {
  const kept: boolean[] = [];
  for (let i = 0; i < total; i++) kept.push(Math.floor((i + 1) * ratio) > Math.floor(i * ratio));
  return kept;
}
