import { type Outcome, PASS_MARK } from "./grade";

// Which topics the Feed's "weak" pool draws from: topics you
// recently got wrong or skipped, plus DSA patterns whose check-ins say weak.

const MIN_ANSWERS = 2;
/** A weak pattern with no card answers yet ranks like a topic missed half the time. */
const PATTERN_WEAKNESS = 0.5;

/** Share of answers per topic that were wrong or skipped. One answer says too little, so topics need two. */
export function topicWeakness(reviews: { topic: string; outcome: Outcome }[]): Map<string, number> {
  const counts = new Map<string, { answers: number; misses: number }>();
  for (const { topic, outcome } of reviews) {
    const count = counts.get(topic) ?? { answers: 0, misses: 0 };
    count.answers++;
    if (outcome !== "correct") count.misses++;
    counts.set(topic, count);
  }
  const weakness = new Map<string, number>();
  for (const [topic, { answers, misses }] of counts) {
    if (answers >= MIN_ANSWERS) weakness.set(topic, misses / answers);
  }
  return weakness;
}

/** Topics answered below the pass mark and weak patterns, weakest first. */
export function weakTopics(weakness: Map<string, number>, weakPatterns: string[]): string[] {
  const ranked = new Map<string, number>();
  for (const [topic, rate] of weakness) {
    if (1 - rate < PASS_MARK) ranked.set(topic, rate);
  }
  for (const pattern of weakPatterns) ranked.set(pattern, Math.max(ranked.get(pattern) ?? 0, PATTERN_WEAKNESS));
  return [...ranked.entries()].toSorted(([a, x], [b, y]) => y - x || a.localeCompare(b)).map(([topic]) => topic);
}
