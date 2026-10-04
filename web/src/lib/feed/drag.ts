// The list arithmetic behind dragging in the Feed. Pure: where an item lands when it
// is dropped, and which way a pointer near the edge of the screen scrolls.

/** The list with `item` placed at `index` (counted after `item` is taken out), others shifting. */
export function placeAt<T>(list: T[], item: T, index: number): T[] {
  const rest = list.filter((entry) => entry !== item);
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), item, ...rest.slice(at)];
}

/** The list without `item`. */
export const without = <T>(list: T[], item: T): T[] => list.filter((entry) => entry !== item);

export type Side = "before" | "after";

/** Which side of a target the pointer is on, along one axis. */
export const sideOf = (pointer: number, start: number, size: number): Side => (pointer < start + size / 2 ? "before" : "after");

/** The index a drop on slot `slot` means: after a filled slot is one further on. */
export const dropIndex = (slot: number, side: Side, filled: boolean): number => (filled && side === "after" ? slot + 1 : slot);

/** -1 to scroll up, 1 to scroll down, 0 to stay: the pointer is within `band` of an edge. */
export function scrollDirection(pointer: number, viewport: number, band = 56): -1 | 0 | 1 {
  if (pointer < band) return -1;
  if (pointer > viewport - band) return 1;
  return 0;
}

/** Tokens in the gaps of a line, in order, after `token` is dropped at gap position `position`. */
export function refill(gaps: number[], placed: (number | null)[], token: number, position: number | null): (number | null)[] {
  const sequence = gaps.flatMap((slot) => {
    const value = placed[slot];
    return value === null || value === undefined ? [] : [value];
  });
  const next = position === null ? without(sequence, token) : placeAt(sequence, token, position);
  const out = placed.map((value) => value);
  gaps.forEach((slot, i) => {
    out[slot] = next[i] ?? null;
  });
  return out;
}
