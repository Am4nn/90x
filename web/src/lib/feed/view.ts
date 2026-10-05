import { stringList } from "@/lib/admin/review";
import { archetype, type ArchetypeId, PRIMITIVES, type Primitive } from "./archetypes";
import { DIAGNOSTIC_AREAS } from "./diagnostic";
import { type Answer, type Outcome, parseWhyStep } from "./grade";
import { parseOptions, type CardOptions } from "./options";
import type { QueueItem, QueueReason } from "./queue";

// What the Feed sends to the browser and how it reads its own stored values.
// Shared by the server service and the client screen, so nothing here may
// import server code.

// What the Feed can serve, which is wider than what the first-visit diagnostic
// measures. These were the same list while `ai`, `lld` and `behavioral` had no
// archetypes and therefore no renderable cards; now that the catalogue covers
// them, keeping the lists equal would mean `cardView` returned null for every
// card in those areas and the Feed silently dropped all of them.
//
// The diagnostic deliberately stays at five: it is a short readiness probe, and
// behavioural readiness is not something a handful of cards can measure.
export const FEED_AREAS = [...DIAGNOSTIC_AREAS, "ai", "lld", "behavioral"] as const;
export type FeedArea = (typeof FEED_AREAS)[number];

export const AREA_LABEL: Record<FeedArea, string> = {
  dsa: "DSA",
  system_design: "Design",
  cs: "CS",
  java: "Java",
  sql: "SQL",
  ai: "AI",
  lld: "LLD",
  behavioral: "Behavioural",
};

/** Written out in full so Tailwind sees every class. */
export const AREA_TEXT: Record<FeedArea, string> = {
  dsa: "text-topic-dsa",
  system_design: "text-topic-sd",
  cs: "text-topic-cs",
  java: "text-topic-java",
  sql: "text-topic-sql",
  ai: "text-topic-ai",
  lld: "text-topic-lld",
  behavioral: "text-topic-beh",
};
export const AREA_DOT: Record<FeedArea, string> = {
  dsa: "bg-topic-dsa",
  system_design: "bg-topic-sd",
  cs: "bg-topic-cs",
  java: "bg-topic-java",
  sql: "bg-topic-sql",
  ai: "bg-topic-ai",
  lld: "bg-topic-lld",
  behavioral: "bg-topic-beh",
};
export const AREA_FILL: Record<FeedArea, string> = {
  dsa: "fill-topic-dsa",
  system_design: "fill-topic-sd",
  cs: "fill-topic-cs",
  java: "fill-topic-java",
  sql: "fill-topic-sql",
  ai: "fill-topic-ai",
  lld: "fill-topic-lld",
  behavioral: "fill-topic-beh",
};

const isFeedArea = (value: unknown): value is FeedArea => (FEED_AREAS as readonly unknown[]).includes(value);

/** Whether a stored `cards.format` is a primitive id. */
export const isPrimitive = (value: string): value is Primitive => (PRIMITIVES as readonly { id: string }[]).some((p) => p.id === value);

export type CardReason = QueueReason | "diagnostic";

/** A card before it is answered: never carries the answer or the key points. */
export type CardView = {
  id: string;
  /** The primitive this card answers with; null for a legacy typed/mcq/output
   *  card still in the old format. */
  primitive: Primitive | null;
  archetype: ArchetypeId | null;
  difficulty: string | null;
  promptMd: string;
  /** The question content, parsed from `cards.options` into the canonical
   *  per-primitive shape: the items of a list primitive, the two sides of a
   *  match, the items and columns of a bucket, the tokens and pre-filled slots
   *  of an assemble, or the rows and columns of a grid toggle. Null when the
   *  primitive has no options (numeric, compose) or the value was empty. */
  options: CardOptions | null;
  /** The why-step's reasons, without the correct one, when this card has a
   *  why-step. The correct index is graded server-side and never leaves it. */
  whyOptions: string[] | null;
  /** The keypad's constraints for a numeric card, derived from the answer's
   *  value and tolerance without revealing either. Null for every other shape. */
  numeric: { decimals: boolean; negative: boolean } | null;
  topic: { slug: string; name: string; area: FeedArea };
  reason: CardReason;
  sourceTitle: string | null;
  /** The rubric a written answer is marked against, shown before answering so the
   *  reader knows what to cover. **Only ever populated for `compose`.** On every
   *  other primitive `cards.keyPoints` is part of the answer, and sending it to
   *  the client would hand the reader the thing they are being asked. */
  rubric: string[] | null;
  /** Position in the diagnostic, 1-based, while one is running. */
  diagnostic: { index: number; total: number } | null;
};

export type AnswerInput = (
  | { cardId: string; skipped: true }
  // The reader telling us something the card cannot know: that this is their first encounter.
  | { cardId: string; declare: "new_to_me" }
  // A legacy typed answer. The Feed no longer asks these; the server keeps the
  // shape so check-feed and any old-format rows still grade.
  | { cardId: string; answer: string }
  | (Answer & { cardId: string; why?: number })
) & {
  /** Made by the browser for each answer, so an offline answer sent twice is graded once. */
  clientId?: string;
};

export type SourceLink = { title: string; href: string | null };
export type AreaSummary = { area: FeedArea; answered: number; correct: number };

/**
 * The correct answer in the card's own shape, sent only once the card has been
 * answered, so the question can be marked up instead of replaced by prose.
 *
 * `ordered` carries the constraints the card claims rather than one blessed
 * sequence - the card stores it that way so every genuinely correct order
 * passes, and a review that invented a single "right order" would call a correct
 * answer wrong.
 *
 * The why-step is deliberately absent: it is a second question with its own
 * options, rendered by its own component, and nothing in the review needs it.
 */
export type CorrectAnswer =
  | { shape: "chosen"; picked: number[] }
  | { shape: "ordered"; constraints: [number, number][]; count: number; alternatives?: number[][] }
  | { shape: "mapping"; pairs: [number, number][] }
  | { shape: "number"; value: number; tolerance: number };

export type AnswerResult = {
  score: number;
  outcome: Outcome;
  pointsHit: boolean[] | null;
  answerMd: string;
  keyPoints: string[];
  options: string[] | null;
  correctOption: number | null;
  /** The reader's own answer, echoed back so the result can show what they chose
   *  beside what was right. Null for a skip, a declaration, or a written answer. */
  submitted: Answer | null;
  /** Null for a legacy card with no structured answer. */
  correct: CorrectAnswer | null;
  /** The question's content, so the result can redraw the card it just asked
   *  rather than describing it. Null when the primitive has no options. */
  content: CardOptions | null;
  sourceRefs: SourceLink[];
  nextDue: string;
  /** XP this answer earned (0 for a skip, a miss, a repeat or a day past its card cap), and the day bonus when it finished the day. */
  xp: number;
  dayBonus: number;
  /** The why-step, once the card is answered: its reasons, the right one, and the one the reader gave (null when they were not asked). */
  why: { options: string[]; correct: number; picked: number | null } | null;
  /** Set when this answer finished the diagnostic. */
  diagnosticSummary: AreaSummary[] | null;
};

export type SessionStats = { answered: number; correct: number; skipped: number; openMissions: number };

export type EmptyReason = "no_cards" | "areas_off" | "nothing_left";

const MISSION_BANNER_AT = 20;

/** `profiles.feed_topics` is `{ areas: [...] }`; null (never set) means every area. */
export function parseFeedAreas(value: unknown): FeedArea[] {
  const areas = value && typeof value === "object" ? (value as { areas?: unknown }).areas : undefined;
  if (!Array.isArray(areas)) return [...FEED_AREAS];
  return FEED_AREAS.filter((area) => areas.includes(area));
}

// Upstash parses JSON values on read, so stored values arrive as either form.
function parsed(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseQueueItem(value: unknown): QueueItem | null {
  const item = parsed(value);
  if (!item || typeof item !== "object") return null;
  const { id, reason } = item as Record<string, unknown>;
  if (typeof id !== "string" || (reason !== "weak" && reason !== "due" && reason !== "new")) return null;
  return { id, reason };
}

export function parseDiagnostic(value: unknown): { ids: string[]; total: number } | null {
  const diagnostic = parsed(value);
  if (!diagnostic || typeof diagnostic !== "object") return null;
  const { ids, total } = diagnostic as Record<string, unknown>;
  if (!Array.isArray(ids) || typeof total !== "number") return null;
  return { ids: stringList(ids), total };
}

/** Links from `cards.source_refs` ([{ kind, id, title }]) into the Library. */
export function sourceLinks(value: unknown): SourceLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((ref: unknown) => {
    if (!ref || typeof ref !== "object") return [];
    const { kind, id, title } = ref as Record<string, unknown>;
    if (typeof title !== "string" || !title) return [];
    const path = kind === "problem" ? "problem" : kind === "doc" ? "doc" : null;
    return [{ title, href: path && typeof id === "string" ? `/library/${path}/${encodeURIComponent(id)}` : null }];
  });
}

/** `cards.archetype` id, validated against the registry so a stray value can't
 *  flow to the UI as a made-up archetype. */
function parseArchetypeId(value: unknown): ArchetypeId | null {
  if (typeof value !== "string") return null;
  return archetype(value as ArchetypeId) ? (value as ArchetypeId) : null;
}

export function cardView(
  row: {
    id: string;
    format: string;
    archetype: string | null;
    difficulty: string | null;
    promptMd: string;
    options: unknown;
    keyPoints: unknown;
    whyStep: unknown;
    value: number | null;
    tolerance: number | null;
    sourceRefs: unknown;
    topicSlug: string;
    topicName: string;
    area: string;
  },
  reason: CardReason,
  diagnostic: CardView["diagnostic"],
): CardView | null {
  if (!isFeedArea(row.area)) return null;
  const primitive = isPrimitive(row.format) ? row.format : null;
  const options = parseOptions(primitive, row.options);
  const numeric =
    typeof row.value === "number" && typeof row.tolerance === "number"
      ? {
          // A fractional answer or tolerance needs a decimal point; a whole
          // count does not. A negative sign is offered only when a negative
          // answer is inside the accepted range.
          decimals: !Number.isInteger(row.value) || !Number.isInteger(row.tolerance),
          negative: row.value < 0 || row.value - row.tolerance <= 0,
        }
      : null;
  return {
    id: row.id,
    primitive,
    archetype: parseArchetypeId(row.archetype),
    difficulty: row.difficulty,
    promptMd: row.promptMd,
    options,
    whyOptions: parseWhyStep(row.whyStep)?.options ?? null,
    numeric,
    topic: { slug: row.topicSlug, name: row.topicName, area: row.area },
    reason,
    sourceTitle: sourceLinks(row.sourceRefs)[0]?.title ?? null,
    // Guarded by primitive, not by whether the column happens to be set: a
    // pick_one card's key points are its answer.
    rubric: primitive === "compose" ? stringList(row.keyPoints) : null,
    diagnostic,
  };
}

export function summarizeDiagnostic(rows: { area: string; outcome: string }[]): AreaSummary[] {
  return FEED_AREAS.flatMap((area) => {
    const mine = rows.filter((row) => row.area === area);
    if (!mine.length) return [];
    return [{ area, answered: mine.length, correct: mine.filter((row) => row.outcome === "correct").length }];
  });
}

export function nextReviewText(nextDue: string, now: Date): string {
  const days = Math.max(1, Math.round((new Date(nextDue).getTime() - now.getTime()) / 86_400_000));
  return days === 1 ? "Next review tomorrow" : `Next review in ${days} days`;
}

export function scoreLine(result: { outcome: Outcome; pointsHit: boolean[] | null }): string {
  if (result.pointsHit?.length) return `${result.pointsHit.filter(Boolean).length} of ${result.pointsHit.length} key points`;
  if (result.outcome === "skipped") return "Skipped";
  if (result.outcome === "new_to_me") return "New to you — here's the answer";
  if (result.outcome === "known") return "Marked as known";
  return result.outcome === "correct" ? "Correct" : "Not quite";
}

/** The verdict word shown above a result. No percentage: a binary card is right or not. */
export function verdictText(outcome: Outcome): string {
  switch (outcome) {
    case "correct":
      return "Correct";
    case "wrong":
      return "Not quite";
    case "skipped":
      return "Skipped";
    case "new_to_me":
      return "New to you — here's the answer";
    case "known":
      return "Marked as known";
  }
}

export function whyLine(card: Pick<CardView, "reason" | "topic">): string {
  switch (card.reason) {
    case "weak":
      return `${card.topic.name} is one of your weak spots. Another go should help it stick.`;
    case "due":
      return "Due for review: you've seen this card before and it's time to recall it again.";
    case "new":
      return `New card on ${card.topic.name}.`;
    case "diagnostic":
      return "Part of your diagnostic: it sets your starting readiness.";
  }
}

export function missionBanner(stats: SessionStats): boolean {
  return stats.answered >= MISSION_BANNER_AT && stats.openMissions > 0;
}

export function accuracyPercent(stats: SessionStats): number | null {
  return stats.answered ? Math.round((stats.correct / stats.answered) * 100) : null;
}
