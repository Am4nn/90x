import { type Card, createEmptyCard, fsrs, generatorParameters, type Grade, Rating as FsrsRating } from "ts-fsrs";
import type { Rating } from "./grade";

// Spaced repetition per card, stored in card_state.

export type SrsState = {
  stability: number;
  difficulty: number;
  dueAt: Date;
  reps: number;
  lapses: number;
  state: number;
  lastReview: Date | null;
};

// Short-term (minute-level) steps are off: they track progress in a
// learning_steps field card_state does not store, and without it a card rated
// Good would sit in Learning forever. Fuzz is off so scheduling is repeatable.
const scheduler = fsrs(generatorParameters({ enable_fuzz: false, enable_short_term: false }));

const GRADES: Record<Rating, Grade> = {
  1: FsrsRating.Again,
  2: FsrsRating.Hard,
  3: FsrsRating.Good,
  4: FsrsRating.Easy,
};

function toCard(prev: SrsState | null, now: Date): Card {
  if (!prev) return createEmptyCard(now);
  // elapsed/scheduled days are derived from last_review and due by ts-fsrs.
  return {
    ...createEmptyCard(prev.dueAt),
    stability: prev.stability,
    difficulty: prev.difficulty,
    reps: prev.reps,
    lapses: prev.lapses,
    state: prev.state,
    last_review: prev.lastReview ?? undefined,
  };
}

export function nextState(prev: SrsState | null, rating: Rating, now: Date): SrsState {
  const { card } = scheduler.next(toCard(prev, now), now, GRADES[rating]);
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    dueAt: card.due,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ?? now,
  };
}

/** New cards (no state yet) are "new", not due. */
export function isDue(state: SrsState | null, now: Date): boolean {
  return state !== null && state.dueAt.getTime() <= now.getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Far enough out that a retired card leaves the rotation for this campaign. */
export const RETIRED_DAYS = 365;

/** The least a correct answer waits before the card may come back, by how it was answered: Hard, Good, Easy. */
const CORRECT_FLOOR_DAYS: Record<2 | 3 | 4, number> = { 2: 7, 3: 14, 4: 30 };

/**
 * A correct answer waits at least its floor, longer than the scheduler alone would have it: a feed this
 * size does not need a card back after a day or two. `retire` takes it out of rotation for the campaign
 * (a card labelled easy, or a topic the reader has shown). A wrong answer is left to the scheduler, so
 * it still comes back soon.
 */
export function stretchCorrect(next: SrsState, { rating, now, retire }: { rating: Rating; now: Date; retire: boolean }): SrsState {
  if (rating < 2) return next;
  const days = retire ? RETIRED_DAYS : CORRECT_FLOOR_DAYS[rating as 2 | 3 | 4];
  const floor = new Date(now.getTime() + days * DAY_MS);
  return next.dueAt.getTime() >= floor.getTime() ? next : { ...next, dueAt: floor };
}
