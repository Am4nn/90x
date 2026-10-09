import { type Outcome, PASS_MARK } from "@/lib/feed/grade";
import { topicWeakness } from "@/lib/feed/weakness";
import { DAY_NAMES } from "@/lib/tracker/dates";
import { weakestPatterns } from "@/lib/tracker/me-rules";
import { SLOT_TYPES } from "@/lib/tracker/template";
import { fenceName } from "./prompt-safety";

// Coach tool results, cut down before they reach the model: small
// JSON with the fields the coach reasons about, never raw rows. Each function
// picks its fields by name, so a column added to a query later can't leak
// into a prompt by accident.

const round = (n: number | null | undefined) => (typeof n === "number" ? Math.round(n) : null);
const day = (iso: string) => iso.slice(0, 10);

/** Plain text, whitespace collapsed, cut on a word at about `max` characters. */
export function snippet(text: string, max: number): string {
  const flat = text
    .replace(/[#*_`>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

// get_progress

export function summarizeProgress(input: {
  snapshot: { overall: number | null; perArea: unknown } | null;
  trend: { date: string; overall: number | null }[];
  streak: number;
  campaign: { day: number; length: number } | null;
}) {
  const perArea = (input.snapshot?.perArea ?? {}) as Record<string, { score?: number | null } | undefined>;
  const points = input.trend.map((t) => [t.date, round(t.overall)] as const);
  const scored = points.filter(([, v]) => v != null) as (readonly [string, number])[];
  const from = scored[0]?.[1] ?? null;
  const to = scored.at(-1)?.[1] ?? null;
  return {
    readiness: round(input.snapshot?.overall),
    areas: Object.fromEntries(Object.entries(perArea).map(([area, v]) => [area, round(v?.score)])),
    trend: { from, to, change: from != null && to != null ? to - from : null, points },
    streak: input.streak,
    campaign: input.campaign ? `Day ${input.campaign.day} of ${input.campaign.length}` : "No active campaign",
  };
}

// get_weak_spots

type PatternStat = { slug: string; name: string; solved: number; failed: number; total: number };

export function summarizeWeakSpots(input: {
  patterns: PatternStat[];
  misses: { title: string; pattern: string | null; result: string }[];
  cardAnswers: { topic: string; name: string; outcome: string }[];
  mocks: { type: string; topic: string; score: number | null }[];
}) {
  const names = new Map(input.cardAnswers.map((a) => [a.topic, a.name]));
  const answers = new Map<string, number>();
  for (const a of input.cardAnswers) {
    if (a.outcome === "new_to_me" || a.outcome === "known") continue;
    answers.set(a.topic, (answers.get(a.topic) ?? 0) + 1);
  }
  // Declared gaps are their own kind of evidence: the reader said outright
  // that they have not met this, which is stronger and cleaner than inferring
  // it from a wrong answer, and the coach should treat it differently.
  const declaredCounts = new Map<string, number>();
  for (const a of input.cardAnswers) {
    if (a.outcome === "new_to_me") declaredCounts.set(a.topic, (declaredCounts.get(a.topic) ?? 0) + 1);
  }
  const declared = [...declaredCounts]
    .toSorted(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, 5)
    .map(([slug, times]) => ({ topic: names.get(slug) ?? slug, slug, times }));
  const weakness = topicWeakness(input.cardAnswers.map((a) => ({ topic: a.topic, outcome: a.outcome as Outcome })));
  const topics = [...weakness]
    .filter(([, rate]) => 1 - rate < PASS_MARK)
    .toSorted(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, 5)
    .map(([slug, rate]) => {
      const total = answers.get(slug) ?? 0;
      return { topic: names.get(slug) ?? slug, slug, missed: `${Math.round(rate * total)} of ${total}` };
    });
  return {
    patterns: weakestPatterns(input.patterns, 5).map((p) => ({
      pattern: p.name,
      slug: p.slug,
      solved: p.solved,
      failed: p.failed,
      recentMisses: [...new Set(input.misses.filter((m) => m.pattern === p.slug).map((m) => m.title))].slice(0, 3),
    })),
    topics,
    declaredNew: declared,
    mocks: input.mocks
      .filter((m) => m.score != null && m.score < PASS_MARK * 100)
      .slice(0, 3)
      .map((m) => ({ type: m.type, topic: m.topic, score: m.score })),
  };
}

// get_recent_activity

export function summarizeActivity(input: {
  checkins: { title: string; result: string; minutes: number | null; createdAt: string }[];
  cardAnswers: { name: string; outcome: string }[];
  mocks: { type: string; topic: string; score: number | null; status: string; startedAt: string }[];
}) {
  const byTopic = new Map<string, { answered: number; correct: number }>();
  for (const a of input.cardAnswers) {
    const t = byTopic.get(a.name) ?? { answered: 0, correct: 0 };
    t.answered++;
    if (a.outcome === "correct") t.correct++;
    byTopic.set(a.name, t);
  }
  return {
    checkins: input.checkins.slice(0, 10).map((c) => ({ problem: c.title, result: c.result, minutes: c.minutes, date: day(c.createdAt) })),
    cards: {
      answered: input.cardAnswers.length,
      correct: input.cardAnswers.filter((a) => a.outcome === "correct").length,
      byTopic: [...byTopic]
        .toSorted(([, a], [, b]) => b.answered - a.answered)
        .slice(0, 6)
        .map(([topic, t]) => ({ topic, ...t })),
    },
    mocks: input.mocks.slice(0, 5).map((m) => ({ type: m.type, topic: m.topic, score: m.score, status: m.status, date: day(m.startedAt) })),
  };
}

// get_plan

export function summarizePlan(input: {
  today: {
    dayNumber: number;
    lengthDays: number;
    missions: { title: string; slotType: string; status: string; estMinutes: number; ref: string }[];
  } | null;
  templates: Record<number, Record<string, number>> | null;
  companyFocus: { companies: string[]; from: string; to: string } | null;
}) {
  return {
    today: input.today
      ? {
          day: `Day ${input.today.dayNumber} of ${input.today.lengthDays}`,
          missions: input.today.missions.map((m) => ({
            title: m.title,
            type: m.slotType,
            status: m.status,
            minutes: m.estMinutes,
            ref: m.ref,
          })),
        }
      : "No active campaign. The user can start one in Me → Plan.",
    // Weekday → slot counts, so the coach knows the "from" of any template
    // change. Only real slots: a plan stored before cards left the template
    // still has a `cards` count, which is not something the coach can change.
    templates: input.templates
      ? Object.fromEntries(
          DAY_NAMES.map((name, i) => [name, Object.fromEntries(SLOT_TYPES.map((t) => [t, input.templates?.[i]?.[t] ?? 0]))]),
        )
      : {},
    companyFocus: input.companyFocus ? `${input.companyFocus.companies.join(", ")} until ${input.companyFocus.to}` : null,
  };
}

// find_problems / find_cards

export function summarizeProblems(
  rows: { slug: string; title: string; difficulty: string | null; pattern: string | null; status: string | null; premium: boolean }[],
) {
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    difficulty: r.difficulty,
    pattern: r.pattern,
    status: r.status ?? "not tried",
    premium: r.premium,
  }));
}

export function summarizeCards(rows: { id: string; topic: string; format: string; promptMd: string; lastOutcome: string | null }[]) {
  return rows.map((r) => ({
    id: r.id,
    topic: r.topic,
    format: r.format,
    prompt: snippet(r.promptMd, 160),
    ...(r.lastOutcome ? { lastResult: r.lastOutcome } : {}),
  }));
}

// get_friend_summary: public stats only.

export function summarizeFriends(
  rows: {
    name: string;
    readiness: number | null;
    streak: number;
    solvedThisWeek: number;
    mocks: { type: string; topic: string; score: number | null }[];
  }[],
) {
  return rows.map((r) => ({
    // A display name is user-controlled data that reaches another user's model
    // prompt: cut to a short plain label and fenced, never a line of instructions.
    name: fenceName(r.name),
    readiness: round(r.readiness),
    streak: r.streak,
    solvedThisWeek: r.solvedThisWeek,
    mockScores: r.mocks.map((m) => ({ type: m.type, topic: m.topic, score: m.score })),
  }));
}

// search_knowledge

const SNIPPET_CHARS = 400;

/** Upstash Vector query-data hits → title, link, snippet. Each hit holds title/url in metadata and the chunk as data. */
export function summarizeSearch(hits: unknown) {
  const list = Array.isArray(hits) ? hits : [];
  const results = list.flatMap((hit) => {
    const { data, metadata } = (hit ?? {}) as { data?: unknown; metadata?: Record<string, unknown> };
    const title = typeof metadata?.title === "string" ? metadata.title : null;
    const url = typeof metadata?.url === "string" ? metadata.url : null;
    if (!title && !url) return [];
    return [{ title: title ?? "Untitled", url: url ?? "", snippet: typeof data === "string" ? snippet(data, SNIPPET_CHARS) : "" }];
  });
  return {
    results,
    note: results.length
      ? "Answer from these passages and cite each source you use by its title."
      : "Nothing relevant in the library. Say so rather than guessing a source.",
  };
}
