import { stringList } from "@/lib/admin/review";
import { archetype, type ArchetypeId, PRIMITIVES, type Primitive } from "./archetypes";
import { DIAGNOSTIC_AREAS } from "./diagnostic";
import { type Answer, type Outcome, parseWhyStep } from "./grade";
import type { QueueItem, QueueReason } from "./queue";

// What the Feed sends to the browser and how it reads its own stored values.
// Shared by the server service and the client screen, so nothing here may
// import server code.

export const FEED_AREAS = DIAGNOSTIC_AREAS;
export type FeedArea = (typeof FEED_AREAS)[number];

export const AREA_LABEL: Record<FeedArea, string> = { dsa: "DSA", system_design: "Design", cs: "CS", java: "Java", sql: "SQL" };

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
  /** The choices the answer is made from (options for pick one, the items to
   *  order, the left side of a match). Null when the shape has no options. */
  options: string[] | null;
  /** The why-step's reasons, without the correct one, when this card has a
   *  why-step. The correct index is graded server-side and never leaves it. */
  whyOptions: string[] | null;
  topic: { slug: string; name: string; area: FeedArea };
  reason: CardReason;
  sourceTitle: string | null;
  /** Whether the reader has earned the right to retire cards on this topic. */
  canDeclareKnown: boolean;
  /** Position in the diagnostic, 1-based, while one is running. */
  diagnostic: { index: number; total: number } | null;
};

export type AnswerInput = (
  | { cardId: string; skipped: true }
  | { cardId: string; selfMark: "got" | "missed"; answer?: string }
  // The reader telling us something the card cannot know: that this is their
  // first encounter, or that they knew it before 90x ever showed it to them.
  | { cardId: string; declare: "new_to_me" | "known" }
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

export type AnswerResult = {
  score: number;
  outcome: Outcome;
  pointsHit: boolean[] | null;
  answerMd: string;
  keyPoints: string[];
  options: string[] | null;
  correctOption: number | null;
  sourceRefs: SourceLink[];
  nextDue: string;
  /** After "I already know this": the rest of the topic, offered once. */
  retireOffer: { topicSlug: string; topicName: string; remaining: number } | null;
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
    whyStep: unknown;
    sourceRefs: unknown;
    topicSlug: string;
    topicName: string;
    area: string;
  },
  reason: CardReason,
  diagnostic: CardView["diagnostic"],
  canDeclareKnown = false,
): CardView | null {
  if (!isFeedArea(row.area)) return null;
  const options = stringList(row.options);
  return {
    id: row.id,
    primitive: isPrimitive(row.format) ? row.format : null,
    archetype: parseArchetypeId(row.archetype),
    difficulty: row.difficulty,
    promptMd: row.promptMd,
    options: options.length ? options : null,
    whyOptions: parseWhyStep(row.whyStep)?.options ?? null,
    topic: { slug: row.topicSlug, name: row.topicName, area: row.area },
    reason,
    sourceTitle: sourceLinks(row.sourceRefs)[0]?.title ?? null,
    canDeclareKnown,
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
