type TrendPoint = { date: string; overall: number | null };

/**
 * The readiness trend as it reads once today's snapshot is stored: the stored points
 * (oldest first) with today's set to `overall`, added in date order if it wasn't stored yet.
 */
export function withTodayPoint(points: TrendPoint[], today: string, overall: number | null): TrendPoint[] {
  if (points.some((p) => p.date === today)) return points.map((p) => (p.date === today ? { date: p.date, overall } : p));
  return [...points, { date: today, overall }].toSorted((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

type PatternStat = { slug: string; name: string; solved: number; failed: number; total: number };

/** Patterns you've tried, ranked by how often attempts succeed (lowest first). */
export function weakestPatterns<T extends PatternStat>(patterns: T[], n = 3): (T & { detail: string })[] {
  return patterns
    .filter((p) => p.solved + p.failed > 0)
    .map((p) => ({ ...p, rate: p.solved / (p.solved + p.failed), detail: `${p.solved} solved, ${p.failed} failed` }))
    .toSorted((a, b) => a.rate - b.rate || b.failed - a.failed)
    .slice(0, n);
}
