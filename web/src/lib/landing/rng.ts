/**
 * A seeded random number generator (mulberry32): the same seed gives the same numbers on
 * every machine, so the particles start in the same places every time and a screenshot of
 * the page can be compared with the last one.
 */
export function seeded(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
