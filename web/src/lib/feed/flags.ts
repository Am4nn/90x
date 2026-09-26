// When a card leaves the feed until an admin looks at it: two
// flags, or everyone who met it skipped it for 14 days.

export const FLAGS_TO_HIDE = 2;
const STALE_DAYS = 14;

export function shouldHideStale(card: { answers: number; skips: number; firstSeenDaysAgo: number }): boolean {
  return card.answers > 0 && card.skips === card.answers && card.firstSeenDaysAgo >= STALE_DAYS;
}
