import { addDays } from "./dates";

// Readiness: area score = coverage × recent accuracy × 100.
// An area with no attempts has no score (shown as "No data yet"), and the
// overall number averages only the areas that have one.

const AREA_WEIGHTS: Record<string, number> = { dsa: 35, system_design: 25, cs: 20, java: 15, sql: 5 };
const RESULT_VALUE = { solved: 1, hints: 0.5, failed: 0 } as const;
const RECENT_DAYS = 14;

export type AreaReading = { coverage: number; accuracy: number | null; score: number | null };

export function dsaArea(
  important: { slug: string; importance: number }[],
  attempts: { slug: string; result: keyof typeof RESULT_VALUE; date: string }[],
  today: string,
): AreaReading {
  const total = important.reduce((s, p) => s + p.importance, 0);
  const tried = new Set(attempts.map((a) => a.slug));
  const coverage = total ? important.filter((p) => tried.has(p.slug)).reduce((s, p) => s + p.importance, 0) / total : 0;
  if (!attempts.length) return { coverage, accuracy: null, score: null };
  const recentFrom = addDays(today, -(RECENT_DAYS - 1));
  let weighted = 0;
  let weights = 0;
  for (const a of attempts) {
    const w = a.date >= recentFrom ? 2 : 1;
    weighted += RESULT_VALUE[a.result] * w;
    weights += w;
  }
  const accuracy = weighted / weights;
  return { coverage, accuracy, score: Math.round(coverage * accuracy * 100) };
}

/** Design, CS, Java, SQL: coverage from studied topics; accuracy arrives with Feed cards. */
export function topicArea(topics: { slug: string; importance: number }[], studied: Set<string>): AreaReading {
  const total = topics.reduce((s, t) => s + t.importance, 0);
  const coverage = total ? topics.filter((t) => studied.has(t.slug)).reduce((s, t) => s + t.importance, 0) / total : 0;
  return { coverage, accuracy: null, score: null };
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
