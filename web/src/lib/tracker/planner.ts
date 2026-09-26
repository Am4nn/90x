import type { PatternNode } from "@/lib/library/queries";
import { SLOT_MINUTES, type SlotType, type Slots } from "./template";

// Fills one day's slots. Pure: the service loads the inputs.

export type PlannerInput = {
  date: string;
  slots: Slots;
  /** Active ladder reviews due on or before `date`, including carried-over ones. */
  dueReviews: { slug: string; title: string; dueDate: string }[];
  /** Patterns in roadmap order, with the user's mastery. */
  patterns: Pick<PatternNode, "slug" | "name" | "total" | "solved" | "failed" | "state">[];
  problems: { slug: string; title: string; patternSlug: string; importance: number; premium: boolean; companies: Record<string, number> }[];
  /** Problems the user has any check-in for. */
  attempted: Set<string>;
  topics: { slug: string; name: string; area: string; importance: number }[];
  studied: Set<string>;
  /** Readiness per area; null = no data yet (planned first). */
  areaScores: Record<string, number | null>;
  hasPremium: boolean;
  companyFocus: { company: string; from: string; to: string } | null;
  /** False until an admin has published some cards; card slots wait until then. */
  hasLiveCards: boolean;
};

export type PlannedMission = {
  slotType: SlotType;
  ref: string;
  title: string;
  estMinutes: number;
  reason: string;
  status: "open" | "coming_soon";
};

const WEAKNESS = { weak: 0, untouched: 1, started: 2, mastered: 3 } as const;

const AREA_LABEL: Record<string, string> = { system_design: "Design", cs: "CS", java: "Java", sql: "SQL" };

function patternReason(p: PlannerInput["patterns"][number]): string {
  if (p.state === "weak") return `${p.name} is your weakest pattern (${p.solved} solved, ${p.failed} failed)`;
  if (p.state === "untouched") return `Start ${p.name}: nothing solved there yet`;
  return `Keep ${p.name} going (${p.solved} of ${p.total} solved)`;
}

function newProblems(input: PlannerInput, count: number, taken: Set<string>): PlannedMission[] {
  const focus =
    input.companyFocus && input.companyFocus.from <= input.date && input.date <= input.companyFocus.to ? input.companyFocus.company : null;
  const score = (p: PlannerInput["problems"][number]) => p.importance + (focus ? (p.companies[focus] ?? 0) : 0);
  const ordered = input.patterns
    .map((p, i) => ({ p, i }))
    .toSorted((a, b) => WEAKNESS[a.p.state] - WEAKNESS[b.p.state] || a.i - b.i)
    .map(({ p }) => p);

  const out: PlannedMission[] = [];
  // One per pattern per pass, weakest first, so several slots spread out.
  while (out.length < count) {
    let added = false;
    for (const pattern of ordered) {
      if (out.length === count) break;
      const best = input.problems
        .filter(
          (p) => p.patternSlug === pattern.slug && !input.attempted.has(p.slug) && !taken.has(p.slug) && (input.hasPremium || !p.premium),
        )
        .toSorted((a, b) => score(b) - score(a))[0];
      if (!best) continue;
      taken.add(best.slug);
      const boosted = focus && best.companies[focus] ? ` · asked at ${focus}` : "";
      out.push({
        slotType: "new_problem",
        ref: best.slug,
        title: best.title,
        estMinutes: SLOT_MINUTES.new_problem,
        reason: patternReason(pattern) + boosted,
        status: "open",
      });
      added = true;
    }
    if (!added) break;
  }
  return out;
}

function topicMissions(input: PlannerInput, count: number): PlannedMission[] {
  const areas = [...new Set(input.topics.map((t) => t.area))].toSorted((a, b) => (input.areaScores[a] ?? -1) - (input.areaScores[b] ?? -1));
  const out: PlannedMission[] = [];
  const taken = new Set<string>();
  while (out.length < count) {
    let added = false;
    for (const area of areas) {
      if (out.length === count) break;
      const next = input.topics
        .filter((t) => t.area === area && !input.studied.has(t.slug) && !taken.has(t.slug))
        .toSorted((a, b) => b.importance - a.importance)[0];
      if (!next) continue;
      taken.add(next.slug);
      const label = AREA_LABEL[area] ?? area;
      const why = input.areaScores[area] == null ? `${label} has no practice yet` : `${label} is one of your weaker areas`;
      out.push({
        slotType: "topic",
        ref: next.slug,
        title: next.name,
        estMinutes: SLOT_MINUTES.topic,
        reason: `${why}; ${next.name} is next by importance`,
        status: "open",
      });
      added = true;
    }
    if (!added) break;
  }
  return out;
}

export function planDay(input: PlannerInput): PlannedMission[] {
  const reviews: PlannedMission[] = input.dueReviews
    .toSorted((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, input.slots.review)
    .map((r) => ({
      slotType: "review" as const,
      ref: r.slug,
      title: r.title,
      estMinutes: SLOT_MINUTES.review,
      reason: r.dueDate < input.date ? `Review carried over from ${r.dueDate}` : "Due for review: you struggled with it last time",
      status: "open" as const,
    }));

  // A review slot with nothing due becomes another new problem.
  const spare = input.slots.review - reviews.length;
  const taken = new Set(input.dueReviews.map((r) => r.slug));
  const fresh = newProblems(input, input.slots.new_problem + spare, taken);

  const cards: PlannedMission[] = Array.from({ length: input.slots.cards }, (_, i) => ({
    slotType: "cards" as const,
    ref: `cards-${i + 1}`,
    title: "10 cards",
    estMinutes: SLOT_MINUTES.cards,
    reason: input.hasLiveCards ? "Answer 10 cards in the Feed" : "Arrives once the first cards are approved",
    status: input.hasLiveCards ? ("open" as const) : ("coming_soon" as const),
  }));

  return [...reviews, ...fresh, ...topicMissions(input, input.slots.topic), ...cards];
}
