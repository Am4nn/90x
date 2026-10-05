// Feed mix balance: in any 10 cards in a row a reader is served, no one card
// kind (primitive) and no one area may take more than 6. Pure rules, no I/O,
// so the cap can be tested over long simulated sessions.

/** How many consecutive served cards the cap looks across. */
export const MIX_WINDOW = 10;
/** Most cards of one kind (or one area) allowed inside the window. */
export const MIX_CAP = 6;

export type MixCard = { kind: string; area: string };

type Options = {
  /** Turn the area cap off. For a reader whose filters leave one area, where
   *  the cap could only ever block everything. Defaults to on. */
  capAreas?: boolean;
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
 * them). The first candidate that keeps both its kind and its area within the
 * cap wins. When none does, the one that breaks the fewest caps wins, the
 * highest ranked among equals, so the reader is never starved: a pool of one
 * kind just serves that kind.
 */
export function pickBalanced(recent: MixCard[], candidates: MixCard[], options: Options = {}): number {
  const { capAreas = true } = options;
  const window = recent.slice(0, MIX_WINDOW - 1);
  let best = -1;
  let bestBroken = Infinity;
  for (const [index, card] of candidates.entries()) {
    let broken = 0;
    if (countOf(window, "kind", card.kind) + 1 > MIX_CAP) broken++;
    if (capAreas && countOf(window, "area", card.area) + 1 > MIX_CAP) broken++;
    if (broken === 0) return index;
    if (broken < bestBroken) [best, bestBroken] = [index, broken];
  }
  return best;
}
