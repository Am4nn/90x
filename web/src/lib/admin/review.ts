import { batchVerdict, PASS_AT, SAMPLE_SIZE } from "@/lib/feed/review-sample";

// Pure helpers for /admin/cards: sampling seed, header counts, area groups,
// and reading the card JSON columns.

export type Verdict = "good" | "bad";

/** A stable number from a batch id (FNV-1a), so a batch always shows the same sample. */
export function seedFromId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

/** Counts for the review header, one entry per sample card (null = not reviewed yet). */
export function reviewProgress(verdicts: (Verdict | null)[]) {
  const size = verdicts.length;
  const given = verdicts.filter((v): v is Verdict => v !== null);
  const good = given.filter((v) => v === "good").length;
  const reviewed = given.length;
  return {
    size,
    reviewed,
    good,
    bad: reviewed - good,
    needed: Math.ceil((PASS_AT * size) / SAMPLE_SIZE),
    outcome: batchVerdict(given, size),
    summary: `${reviewed} of ${size} reviewed · ${good} good`,
  };
}

const AREAS = [
  { key: "dsa", label: "DSA", dot: "bg-topic-dsa" },
  { key: "system_design", label: "Design", dot: "bg-topic-sd" },
  { key: "cs", label: "CS", dot: "bg-topic-cs" },
  { key: "java", label: "Java", dot: "bg-topic-java" },
  { key: "sql", label: "SQL", dot: "bg-topic-sql" },
] as const;

export function areaDot(domain: string | null): string {
  return AREAS.find((a) => a.key === domain)?.dot ?? "bg-mute";
}

/** Batches in area order; domains outside the five feed areas go under Other. */
export function groupByArea<T extends { domain: string }>(items: T[]) {
  const groups = [
    ...AREAS.map((a) => ({ key: a.key as string, label: a.label as string, items: items.filter((i) => i.domain === a.key) })),
    { key: "other", label: "Other", items: items.filter((i) => !AREAS.some((a) => a.key === i.domain)) },
  ];
  return groups.filter((g) => g.items.length > 0);
}

export type Quality = { correct: number; clear: number; relevant: number; issues: string };

/** The AI reviewer's scores (1-5) from `cards.quality`, or null if it has none. */
export function parseQuality(value: unknown): Quality | null {
  if (!value || typeof value !== "object") return null;
  const { correct, clear, relevant, issues } = value as Record<string, unknown>;
  if (typeof correct !== "number" || typeof clear !== "number" || typeof relevant !== "number") return null;
  return { correct, clear, relevant, issues: typeof issues === "string" ? issues : "" };
}

/** Scores below full marks, which the review screen highlights. */
export function weakScores(quality: Quality): ("correct" | "clear" | "relevant")[] {
  return (["correct", "clear", "relevant"] as const).filter((k) => quality[k] < 5);
}

export function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Titles from `cards.source_refs` ([{ kind, id, title }]). */
export function sourceTitles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((ref: unknown) => {
    const title = ref && typeof ref === "object" ? (ref as Record<string, unknown>).title : null;
    return typeof title === "string" && title ? [title] : [];
  });
}
