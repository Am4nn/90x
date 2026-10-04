import type { Outcome } from "./grade";

// Whether the reader has shown a topic. A correct answer in a mastered topic leaves rotation
// instead of coming back for review, so the Feed spends its cards on what is still new to them.

/** The share of cards, by their latest graded answer, that must be correct. */
const MIN_ACCURACY = 0.85;
/** Distinct cards that must have been graded, so one lucky streak on a few cards proves nothing. */
const MIN_CARDS = 6;

export type TopicAnswer = { outcome: Outcome; cardId: string };

const isGraded = (outcome: Outcome) => outcome === "correct" || outcome === "wrong";

/**
 * `answers` arrive oldest first. Accuracy is the latest graded answer per card, so a card answered
 * four times counts once and cannot outvote the rest of the topic. Skips and declarations are not
 * evidence either way.
 */
export function topicMastered(answers: readonly TopicAnswer[]): boolean {
  const latest = new Map<string, Outcome>();
  for (const a of answers) if (isGraded(a.outcome)) latest.set(a.cardId, a.outcome);
  if (latest.size < MIN_CARDS) return false;
  const correct = [...latest.values()].filter((o) => o === "correct").length;
  return correct / latest.size >= MIN_ACCURACY;
}
