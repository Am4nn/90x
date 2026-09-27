import { addDays, localDate } from "./dates";

// Readiness: area score = coverage × recent accuracy × 100.
// An area with no attempts has no score (shown as "No data yet"), and the
// overall number averages only the areas that have one.

const AREA_WEIGHTS: Record<string, number> = { dsa: 35, system_design: 25, cs: 20, java: 15, sql: 5 };
const RESULT_VALUE = { solved: 1, hints: 0.5, failed: 0 } as const;
const RECENT_DAYS = 14;

export type AreaReading = { coverage: number; accuracy: number | null; score: number | null };

/** A Feed card answer (skips score 0), dated by the user's own calendar day. */
export type CardAttempt = { topic: string; score: number; skipped: boolean; date: string };

function recentWeighted(entries: { value: number; date: string }[], today: string): number | null {
  if (!entries.length) return null;
  const recentFrom = addDays(today, -(RECENT_DAYS - 1));
  let weighted = 0;
  let weights = 0;
  for (const e of entries) {
    const w = e.date >= recentFrom ? 2 : 1;
    weighted += e.value * w;
    weights += w;
  }
  return weighted / weights;
}

const cardEntries = (attempts: CardAttempt[]) => attempts.map((a) => ({ value: a.score, date: a.date }));

/** Accuracy blends check-ins and DSA card scores, one entry per answer. */
export function dsaArea(
  important: { slug: string; importance: number }[],
  attempts: { slug: string; result: keyof typeof RESULT_VALUE; date: string }[],
  today: string,
  cardAttempts: CardAttempt[] = [],
): AreaReading {
  const total = important.reduce((s, p) => s + p.importance, 0);
  const tried = new Set(attempts.map((a) => a.slug));
  const coverage = total ? important.filter((p) => tried.has(p.slug)).reduce((s, p) => s + p.importance, 0) / total : 0;
  const accuracy = recentWeighted(
    [...attempts.map((a) => ({ value: RESULT_VALUE[a.result], date: a.date })), ...cardEntries(cardAttempts)],
    today,
  );
  if (accuracy === null) return { coverage, accuracy: null, score: null };
  return { coverage, accuracy, score: Math.round(coverage * accuracy * 100) };
}

/** Check-ins as attempts, each dated by the user's own calendar day. */
export function localAttempts<R extends string>(
  rows: { slug: string; result: R; createdAt: string }[],
  tz: string,
): { slug: string; result: R; date: string }[] {
  return rows.map((r) => ({ slug: r.slug, result: r.result, date: localDate(tz, new Date(r.createdAt)) }));
}

/** Design, CS, Java, SQL: coverage from studied topics and topics with answered cards; accuracy from card scores. */
export function topicArea(
  topics: { slug: string; importance: number }[],
  studied: Set<string>,
  cards: { attempts: CardAttempt[]; today: string } = { attempts: [], today: "" },
): AreaReading {
  const answered = new Set(cards.attempts.filter((a) => !a.skipped).map((a) => a.topic));
  const covered = (slug: string) => studied.has(slug) || answered.has(slug);
  const total = topics.reduce((s, t) => s + t.importance, 0);
  const coverage = total ? topics.filter((t) => covered(t.slug)).reduce((s, t) => s + t.importance, 0) / total : 0;
  const accuracy = recentWeighted(cardEntries(cards.attempts), cards.today);
  if (accuracy === null) return { coverage, accuracy: null, score: null };
  return { coverage, accuracy, score: Math.round(coverage * accuracy * 100) };
}

export function overall(scores: Record<string, number | null>, weights = AREA_WEIGHTS): number | null {
  let sum = 0;
  let total = 0;
  for (const [area, score] of Object.entries(scores)) {
    if (score == null || !weights[area]) continue;
    sum += score * weights[area];
    total += weights[area];
  }
  return total ? Math.round(sum / total) : null;
}

export function band(score: number): "bad" | "warn" | "ok" {
  return score < 40 ? "bad" : score < 70 ? "warn" : "ok";
}
