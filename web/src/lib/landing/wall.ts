// The Feed wall's motion: columns of cards that drift forever, each at its own speed,
// and speed up while the page is scrolled. Pure arithmetic, tested on its own.

/** Columns (wide) or rows (phone) at the landing root's width: three from 980px, two below. */
export const wallColumns = (width: number): 2 | 3 => (width >= 980 ? 3 : 2);

/** Cards dealt out one at a time across `count` columns, so each column gets a mix. */
export function deal<T>(items: readonly T[], count: number): T[][] {
  const columns: T[][] = Array.from({ length: count }, () => []);
  items.forEach((item, index) => columns[index % count]!.push(item));
  return columns;
}

/** Each column's speed relative to the base; the second runs the other way. */
export const COLUMN_SPEEDS = [1, 0.75, 1.15] as const;

/** Base drift in pixels per millisecond. */
const DRIFT = 0.03;

/** How far the wall has drifted, `elapsed` ms after `offset`, speeding up with the page's scroll `velocity` (pixels a frame). */
export function drift(offset: number, elapsed: number, velocity: number): number {
  return offset + elapsed * DRIFT * (1 + Math.min(8, velocity * 0.35));
}

/** A smoothed scroll speed: a tenth of this frame's movement (capped at 40px) blended into the last value. */
export function smoothSpeed(previous: number, movedPx: number): number {
  return previous * 0.9 + Math.min(40, Math.abs(movedPx)) * 0.1;
}

/**
 * Where column `index` sits, in pixels, given the drift and the length of one set of cards
 * (the columns hold two identical sets so they can loop without a seam). The second column
 * runs backwards: it starts a full set up and comes down.
 */
export function columnShift(index: number, offset: number, setLength: number): number {
  if (!setLength) return 0;
  const speed = COLUMN_SPEEDS[index] ?? 1;
  const travelled = (offset * speed) % setLength;
  return index === 1 ? -setLength + travelled : -travelled;
}
