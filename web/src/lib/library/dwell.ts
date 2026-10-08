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

/**
 * How long a lesson must be in front of the reader before the Library shows it as opened
 *: a minute, whatever its length. A glance is not opening it.
 */
export const OPENED_MS = 60_000;

/** Adds up the time something is visible, across any number of pauses. */
export function visibleClock() {
  let total = 0;
  let since: number | null = null;
  return {
    resume(now: number) {
      if (since === null) since = now;
    },
    pause(now: number) {
      if (since !== null) total += now - since;
      since = null;
    },
    elapsed(now: number) {
      return total + (since === null ? 0 : now - since);
    },
  };
}

/**
 * AutoOpened's rule: `send` once, after OPENED_MS of visible time. One watcher per mount, so a lesson opened
 * again (a remount) sends again, which the admin Analytics page counts as a re-open. Call the returned tick on a
 * timer and on every visibility change.
 */
export function openedWatcher(send: () => void, ms = OPENED_MS) {
  const clock = visibleClock();
  let sent = false;
  return (now: number, visible: boolean) => {
    if (visible) clock.resume(now);
    else clock.pause(now);
    if (!sent && clock.elapsed(now) >= ms) {
      sent = true;
      send();
    }
  };
}
