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
