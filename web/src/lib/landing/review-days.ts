// What the page says about when a card comes back after a first answer, in days. These are the
// scheduler's own numbers (lib/feed/srs.ts nextState for a first answer), checked in
// review-days.test.ts: a perfect answer to a pick-one is rated Easy and the Feed books it 30 days out (nextState, then stretchCorrect), a miss
// comes back the next day. The phone demo and the /try page both say them from here.
export const FIRST_MISS_DAYS = 1;
export const FIRST_CORRECT_DAYS = 30;

/** A number of days in plain words, as the page says it: "tomorrow", "in 30 days". */
export const whenText = (days: number): string => (days === 1 ? "tomorrow" : `in ${days} days`);
