// Feed mix balance: in any 10 cards in a row a reader is served, no one card
// kind (primitive) may take more than 6, and no one area more than 3 (so ten
// cards span at least four areas). Pure rules, no I/O, so the caps can be
// tested over long simulated sessions.

/** How many consecutive served cards the cap looks across. */
export const MIX_WINDOW = 10;
/** Most cards of one kind allowed inside the window. */
export const MIX_CAP = 6;
/** Most cards of one area allowed inside the window when the reader has four or more areas on. */
export const AREA_CAP = 3;

/** The area cap for a reader with `areaCount` areas on. Fewer areas can't fill
 *  ten cards at three each, so the cap grows to what they can fill; with one
 *  area there is nothing to balance and the cap is off (the whole window). */
export function areaCap(areaCount: number): number {
  if (areaCount <= 1) return MIX_WINDOW;
  return Math.max(AREA_CAP, Math.ceil(MIX_WINDOW / areaCount));
}

export type MixCard = { kind: string; area: string };

type Options = {
  /** Most cards of one area in the window: `areaCap(areas on)`. Defaults to
   *  AREA_CAP; MIX_WINDOW turns the area cap off. */
  areaCap?: number;
};

function countOf(cards: MixCard[], field: keyof MixCard, value: string): number {
  let n = 0;
  for (const card of cards) if (card[field] === value) n++;
  return n;
}

/**
 * Index of the candidate to serve next, or -1 when there are none.
 *
 * `recent` is what the reader was served last, newest first; only the latest
 * MIX_WINDOW - 1 count, because the candidate takes the tenth place.
 * `candidates` are ranked best first (due reviews keep the place the queue gave
 * them). The first candidate that keeps both its kind and its area within
 * their caps wins. When none does, the one that breaks the fewest caps wins, the
 * highest ranked among equals, so the reader is never starved: a pool of one
 * kind just serves that kind.
 */
export function pickBalanced(recent: MixCard[], candidates: MixCard[], options: Options = {}): number {
  const { areaCap: cap = AREA_CAP } = options;
  const window = recent.slice(0, MIX_WINDOW - 1);
  let best = -1;
  let bestBroken = Infinity;
  for (const [index, card] of candidates.entries()) {
    let broken = 0;
    if (countOf(window, "kind", card.kind) + 1 > MIX_CAP) broken++;
    if (countOf(window, "area", card.area) + 1 > cap) broken++;
    if (broken === 0) return index;
    if (broken < bestBroken) [best, bestBroken] = [index, broken];
  }
  return best;
}
