type PatternStat = { slug: string; name: string; solved: number; failed: number; total: number };

/** Patterns you've tried, ranked by how often attempts succeed (lowest first). */
export function weakestPatterns<T extends PatternStat>(patterns: T[], n = 3): (T & { detail: string })[] {
  return patterns
    .filter((p) => p.solved + p.failed > 0)
    .map((p) => ({ ...p, rate: p.solved / (p.solved + p.failed), detail: `${p.solved} solved, ${p.failed} failed` }))
    .sort((a, b) => a.rate - b.rate || b.failed - a.failed)
    .slice(0, n);
}
