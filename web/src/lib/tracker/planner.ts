import type { PatternNode } from "@/lib/library/queries";
import { DAY_NAMES, shortDate, weekday } from "./dates";
import { type Level, difficultyScore } from "./level";
import { type MissionType, SLOT_MINUTES, type Slots } from "./template";

// Fills one day's slots. Pure: the service loads the inputs.

/** The week's focus from the Sunday review: pattern and topic slugs. */
export type Focus = { patterns: string[]; topics: string[] };

export type PlannerInput = {
  date: string;
  slots: Slots;
  /** Active ladder reviews due on or before `date`, including carried-over ones. */
  dueReviews: { slug: string; title: string; dueDate: string }[];
  /** Patterns in roadmap order, with the user's mastery. */
  patterns: Pick<PatternNode, "slug" | "name" | "total" | "solved" | "failed" | "state">[];
  problems: {
    slug: string;
    title: string;
    patternSlug: string;
    importance: number;
    premium: boolean;
    /** How often each company asks it, 0-100 (LeetCode company frequency). */
    companies: Record<string, number>;
    /** 'Easy' | 'Medium' | 'Hard' by database check constraint. */
    difficulty: string;
  }[];
  /** Problems the user has any check-in for. */
  attempted: Set<string>;
  topics: { slug: string; name: string; area: string; importance: number }[];
  studied: Set<string>;
  /** Topics the reader marked "new to me" on a Feed card. */
  declaredNew: Set<string>;
  /** Readiness per area; null = no data yet (planned first). */
  areaScores: Record<string, number | null>;
  hasPremium: boolean;
  companyFocus: { companies: string[]; from: string; to: string } | null;
  /** False until an admin has published some cards; the cards mission waits until then. */
  hasLiveCards: boolean;
  /** Never asked (null or absent) keeps the pre-level choice exactly. */
  level?: Level | null;
  /** The week's focus; null, absent or empty keeps the plain rotation exactly. */
  focus?: Focus | null;
  /**
   * Planned new problems still open from the latest earlier day that had any, in the order they were
   * planned. They fill the new-problem slots first; absent or empty keeps the plain pick exactly.
   */
  carried?: { slug: string; title: string; from: string; premium: boolean; companies: Record<string, number> }[];
};

export type PlannedMission = {
  slotType: MissionType;
  ref: string;
  title: string;
  estMinutes: number;
  reason: string;
  status: "open" | "coming_soon";
};

const WEAKNESS = { weak: 0, untouched: 1, started: 2, mastered: 3 } as const;

const AREA_LABEL: Record<string, string> = { system_design: "Design", cs: "CS", java: "Java", sql: "SQL" };

// A new problem's reason never names its pattern: on Today that would say how to
// solve it before it is opened. Topics are named, since the topic is the mission.
function patternReason(p: PlannerInput["patterns"][number]): string {
  if (p.state === "weak") return `From your weakest pattern (${p.solved} solved, ${p.failed} failed)`;
  if (p.state === "untouched") return "From a pattern with nothing solved yet";
  return `From a pattern you've started (${p.solved} of ${p.total} solved)`;
}

/** Alternates the first choice between a few focus picks by day, so one is not served daily. */
function rotated<T>(items: T[], date: string): T[] {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const start = ((day % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

const FOCUS_REASON = "This week's focus: ";

/** What a company focus adds at the company's top frequency (100): half the importance scale.
 *  A problem the company asks often can overtake a more important one; one it asks rarely
 *  (frequency 5-10) barely moves. Frequency is 0-100 and importance 0-1, so it is scaled
 *  first: added raw, any problem the company had asked once beat every other one. */
const COMPANY_WEIGHT = 0.5;

/** The picked companies that ask this problem, in pick order, matched ignoring case. */
function askedBy(companies: Record<string, number>, picks: string[]) {
  if (!picks.length) return [];
  const byLower = new Map(Object.entries(companies).map(([k, v]) => [k.toLowerCase(), v]));
  return picks.flatMap((name) => {
    const freq = byLower.get(name.toLowerCase());
    return freq ? [{ name, freq }] : [];
  });
}

/** "A, B, C" for up to three names, then "+N". */
function nameList(names: string[]) {
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ");
}

const focusCompanies = (input: PlannerInput) =>
  input.companyFocus && input.companyFocus.from <= input.date && input.date <= input.companyFocus.to ? input.companyFocus.companies : [];

/** Open planned problems from an earlier day take the new-problem slots first; slots never grow. */
function carriedProblems(input: PlannerInput, count: number, taken: Set<string>): PlannedMission[] {
  const focus = focusCompanies(input);
  const out: PlannedMission[] = [];
  for (const c of input.carried ?? []) {
    if (out.length >= count) break;
    if (input.attempted.has(c.slug) || taken.has(c.slug) || (c.premium && !input.hasPremium)) continue;
    taken.add(c.slug);
    const asking = askedBy(c.companies, focus);
    out.push({
      slotType: "new_problem",
      ref: c.slug,
      title: c.title,
      estMinutes: SLOT_MINUTES.new_problem,
      reason: `Still open from ${DAY_NAMES[weekday(c.from)]}${asking.length ? ` · asked at ${nameList(asking.map((a) => a.name))}` : ""}`,
      status: "open",
    });
  }
  return out;
}

function newProblems(input: PlannerInput, count: number, taken: Set<string>): PlannedMission[] {
  const focus = focusCompanies(input);
  // A level biases the pick by difficulty on top of importance and the focus
  // company, so an experienced reader is not handed Two Sum. It is a
  // preference, never an automatic schedule: it reorders the candidates and
  // never removes one, so a day always has a problem while any remain.
  const boosts = new Map<string, number>();
  const boost = (p: PlannerInput["problems"][number]) => {
    if (!focus.length) return 0;
    let value = boosts.get(p.slug);
    if (value === undefined) {
      value = (COMPANY_WEIGHT * Math.max(0, ...askedBy(p.companies, focus).map((a) => a.freq))) / 100;
      boosts.set(p.slug, value);
    }
    return value;
  };
  const score = (p: PlannerInput["problems"][number]) => p.importance + boost(p) + difficultyScore(input.level, p.difficulty);
  const ordered = input.patterns
    .map((p, i) => ({ p, i }))
    .toSorted((a, b) => WEAKNESS[a.p.state] - WEAKNESS[b.p.state] || a.i - b.i)
    .map(({ p }) => p);

  const bestFor = (pattern: PlannerInput["patterns"][number]) =>
    input.problems
      .filter(
        (p) => p.patternSlug === pattern.slug && !input.attempted.has(p.slug) && !taken.has(p.slug) && (input.hasPremium || !p.premium),
      )
      .toSorted((a, b) => score(b) - score(a))[0];
  const mission = (best: PlannerInput["problems"][number], reason: string): PlannedMission => {
    taken.add(best.slug);
    const asking = askedBy(best.companies, focus);
    const boosted = asking.length ? ` · asked at ${nameList(asking.map((a) => a.name))}` : "";
    return {
      slotType: "new_problem",
      ref: best.slug,
      title: best.title,
      estMinutes: SLOT_MINUTES.new_problem,
      reason: reason + boosted,
      status: "open",
    };
  };

  const out: PlannedMission[] = [];
  // The week's focus leans on the day, never takes it over: at most one
  // problem, from a focus pattern that has something eligible (two focus
  // patterns alternate by day), and that pattern sits out the rest of the day.
  // A focus pattern with nothing left is skipped without comment.
  let focusedPattern: string | null = null;
  const picks = count > 0 ? input.patterns.filter((p) => input.focus?.patterns.includes(p.slug)) : [];
  for (const pattern of picks.length ? rotated(picks, input.date) : []) {
    const best = bestFor(pattern);
    if (!best) continue;
    out.push(mission(best, "This week's focus"));
    focusedPattern = pattern.slug;
    break;
  }
  // One per pattern per pass, weakest first, so several slots spread out.
  while (out.length < count) {
    let added = false;
    for (const pattern of ordered) {
      if (out.length === count) break;
      if (pattern.slug === focusedPattern) continue;
      const best = bestFor(pattern);
      if (!best) continue;
      out.push(mission(best, patternReason(pattern)));
      added = true;
    }
    if (!added) break;
  }
  return out;
}

/**
 * One more new problem by the planner's own rules: the week's focus first when
 * its pattern has something eligible, else the weakest pattern's best. `taken`
 * holds the problems already on the day (and any the planner must not repeat);
 * it is not changed. Null when nothing eligible is left.
 */
export function nextProblem(input: PlannerInput, taken: Iterable<string>): PlannedMission | null {
  return newProblems(input, 1, new Set(taken))[0] ?? null;
}

function topicMissions(input: PlannerInput, count: number): PlannedMission[] {
  // Weakest area first, except that an area holding a topic the reader
  // declared new comes ahead of it: they said they have not met that, which
  // is better evidence than a low score on an area they simply have not
  // started.
  const hasDeclared = (area: string) =>
    input.topics.some((t) => t.area === area && input.declaredNew.has(t.slug) && !input.studied.has(t.slug));
  const areas = [...new Set(input.topics.map((t) => t.area))].toSorted(
    (a, b) => Number(hasDeclared(b)) - Number(hasDeclared(a)) || (input.areaScores[a] ?? -1) - (input.areaScores[b] ?? -1),
  );
  const out: PlannedMission[] = [];
  const taken = new Set<string>();
  // At most one focus topic a day (two focus topics alternate by day). Its area
  // is passed over for the rest of the day while another area has a candidate.
  let focusedArea: string | null = null;
  const picks = count > 0 ? input.topics.filter((t) => input.focus?.topics.includes(t.slug) && !input.studied.has(t.slug)) : [];
  const [pick] = picks.length ? rotated(picks, input.date) : [];
  if (pick) {
    taken.add(pick.slug);
    focusedArea = pick.area;
    out.push({
      slotType: "topic",
      ref: pick.slug,
      title: pick.name,
      estMinutes: SLOT_MINUTES.topic,
      reason: `${FOCUS_REASON}${pick.name}`,
      status: "open",
    });
  }
  while (out.length < count) {
    let added = false;
    for (const area of areas) {
      if (out.length === count) break;
      if (area === focusedArea) continue;
      // A topic the reader marked "new to me" in the Feed comes first: they
      // said outright they have not met it, which beats any inference from
      // importance. It is a preference, never an automatic schedule.
      const available = input.topics.filter((t) => t.area === area && !input.studied.has(t.slug) && !taken.has(t.slug));
      const next = available.toSorted(
        (a, b) => Number(input.declaredNew.has(b.slug)) - Number(input.declaredNew.has(a.slug)) || b.importance - a.importance,
      )[0];
      if (!next) continue;
      taken.add(next.slug);
      const label = AREA_LABEL[area] ?? area;
      const why = input.declaredNew.has(next.slug)
        ? "you marked this new to you in the Feed"
        : input.areaScores[area] == null
          ? `${label} has no practice yet`
          : `${label} is one of your weaker areas`;
      out.push({
        slotType: "topic",
        ref: next.slug,
        title: next.name,
        estMinutes: SLOT_MINUTES.topic,
        reason: input.declaredNew.has(next.slug) ? why : `${why}; ${next.name} is next by importance`,
        status: "open",
      });
      added = true;
    }
    if (!added && focusedArea) focusedArea = null;
    else if (!added) break;
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
      reason:
        r.dueDate < input.date ? `Review carried over from ${shortDate(r.dueDate)}` : "Due for review: you struggled with it last time",
      status: "open" as const,
    }));

  // A review slot with nothing due becomes another new problem.
  const spare = input.slots.review - reviews.length;
  const taken = new Set(input.dueReviews.map((r) => r.slug));
  const slotCount = input.slots.new_problem + spare;
  const carried = carriedProblems(input, slotCount, taken);
  const fresh = [...carried, ...newProblems(input, slotCount - carried.length, taken)];

  // Every day has exactly one "10 cards" mission; it is not a template slot.
  const cards: PlannedMission = {
    slotType: "cards",
    ref: "cards-1",
    title: "10 cards",
    estMinutes: SLOT_MINUTES.cards,
    reason: input.hasLiveCards ? "Answer 10 cards in the Feed" : "Arrives once the first cards are approved",
    status: input.hasLiveCards ? "open" : "coming_soon",
  };

  return [...reviews, ...fresh, ...topicMissions(input, input.slots.topic), cards];
}
