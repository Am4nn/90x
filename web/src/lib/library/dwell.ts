// How long a lesson must be open before scrolling to the end counts as
// studying it.
//
// "Studied" feeds coverage in the readiness score, so a glance that moves that
// number makes the score a lie. Scrolling alone is a keystroke; the time
// floor is what makes it evidence.

/** Reading speed for the floor; 200 words a minute is unhurried. */
const WORDS_PER_MINUTE = 200;
/** A fast but real read. Below this it is skimming, which is not studying. */
const READ_FRACTION = 0.4;
/** However short the lesson, a stub must not mark itself studied on open. */
const MIN_DWELL_MS = 20_000;

export function dwellMs(words: number): number {
  const full = (words / WORDS_PER_MINUTE) * 60_000;
  return Math.max(MIN_DWELL_MS, Math.round(full * READ_FRACTION));
}
