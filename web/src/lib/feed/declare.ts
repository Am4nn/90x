import type { Outcome } from "./grade";

// The two things a card cannot work out about its reader.
//
// "New to me" is always available: the reader is telling us this is their
// first encounter, which no amount of stored progress can infer, because
// topic_progress only knows what they studied inside 90x.
//
// "I already know this" is earned, because it retires a card. The bar is
// proportional: a topic holds 8-12 cards, so an absolute count of ten would
// mean answering nearly all of them before the button appeared, leaving
// nothing to retire and making the feature pointless.

const MIN_ACCURACY = 0.8;
const MIN_ANSWERS = 3;
/** ...and this share of the topic's cards, so the bar scales with topic size. */
const MIN_SHARE = 1 / 3;

export type TopicRecord = {
  /** Oldest first: the caller orders, so "latest" here means the last of them. */
  answers: { outcome: Outcome; cardId: string }[];
  cardsInTopic: number;
};

// A skip counts against you here, unlike in accuracy. Answering three cards
// and skipping five is not evidence that you know the topic; it is evidence
// you avoided most of it. Declarations are still ignored, since they say
// nothing either way.
const isAttempt = (outcome: Outcome) => outcome === "correct" || outcome === "wrong" || outcome === "skipped";

/** Whether the reader has earned the right to retire a card on this topic.
 *
 * Coverage counts DISTINCT cards, not answers. A due card answered four times
 * over four days is one card's worth of evidence, and counting the rows would
 * let someone clear a twelve-card topic having seen one of them, then retire
 * the other eleven unseen. */
export function canDeclareKnown({ answers, cardsInTopic }: TopicRecord): boolean {
  const tried = answers.filter((a) => isAttempt(a.outcome));
  const distinct = new Set(tried.map((a) => a.cardId));
  if (distinct.size < MIN_ANSWERS) return false;
  if (cardsInTopic > 0 && distinct.size < Math.ceil(cardsInTopic * MIN_SHARE)) return false;
  // Accuracy is the latest answer per card, so repeated attempts on one card
  // cannot outvote the rest of the topic. This relies on `answers` arriving
  // oldest first; unordered rows would let an old wrong answer overwrite a
  // newer correct one, or the reverse.
  const latest = new Map<string, Outcome>();
  for (const a of tried) latest.set(a.cardId, a.outcome);
  const correct = [...latest.values()].filter((o) => o === "correct").length;
  return correct / latest.size >= MIN_ACCURACY;
}
