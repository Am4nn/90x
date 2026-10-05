import { dayStatus } from "@/lib/tracker/days";
import type { Result, Review } from "@/lib/tracker/ladder";

// XP rules. Pure: every number lives here, and the
// live write paths and the one-off back-fill both go through these functions, so
// they cannot disagree about what a thing is worth.
//
// The rule that shapes it: XP must never come from an AI-graded answer alone,
// because the model can be talked into a grade. A card marked by a pure function
// or an exact match earns the full amount; a card the model marked earns less and
// is capped per day. A self-rating, a declaration ("new to me") and a skip earn
// nothing.

/** What each thing is worth. */
export const XP = {
  /** A problem solved for the first time. */
  problem: 30,
  /** A problem solved for the first time, but with hints. */
  problemHints: 20,
  /** A review from the ladder done (a clean solve once it is due). */
  review: 15,
  /** A topic studied. */
  topic: 20,
  /** A correct Feed card marked by a rule (match or pure grader). */
  card: 2,
  /** A correct Feed card marked by the model (a written answer). */
  cardAi: 1,
  /** Every mission of the day done. */
  dayBonus: 20,
} as const;

/** Most a reader can earn from Feed cards in one day, AI-graded ones included. */
export const CARD_DAILY_CAP = 100;
/** Most of that the model's grades can account for. */
export const AI_CARD_DAILY_CAP = 10;

export type XpKind = "problem" | "review" | "topic" | "card" | "card_ai" | "bonus";

/** One award: what earned it (`ref`), its kind and its amount. The day is the caller's. */
export type XpAward = { kind: XpKind; ref: string; xp: number };

/** What an action earned, for the "+N XP" the UI shows. `bonus` is the day bonus, apart from `xp`. */
export type XpGain = { xp: number; bonus: number };

export const NO_GAIN: XpGain = { xp: 0, bonus: 0 };

/**
 * What a check-in earns. `firstSolve`: it is the first non-failed check-in for
 * this problem. `review`: the problem's ladder entry as it stood before this
 * check-in. A failed attempt earns nothing and neither does a problem solved
 * again once it earned its new-problem XP, unless it is a review that is due and
 * solved cleanly.
 */
export function checkinAward(c: { slug: string; result: Result; day: string; firstSolve: boolean; review: Review | null }): XpAward | null {
  if (c.result === "failed") return null;
  if (c.firstSolve) return { kind: "problem", ref: c.slug, xp: c.result === "solved" ? XP.problem : XP.problemHints };
  if (c.result === "solved" && c.review?.status === "active" && c.review.dueDate <= c.day) {
    return { kind: "review", ref: c.slug, xp: XP.review };
  }
  return null;
}

export const topicAward = (slug: string): XpAward => ({ kind: "topic", ref: slug, xp: XP.topic });

/** The graders that run no model, or that the reader cannot influence. */
const RULE_GRADERS = new Set(["match", "pure"]);

/**
 * What a Feed answer earns before the daily caps: only a correct one, 2 from a
 * rule grader and 1 from the model. Self-rated, declared, skipped and legacy
 * "options" answers earn nothing.
 */
export function cardAward(a: { cardId: string; outcome: string; gradedBy: string }): XpAward | null {
  if (a.outcome !== "correct") return null;
  if (RULE_GRADERS.has(a.gradedBy)) return { kind: "card", ref: a.cardId, xp: XP.card };
  if (a.gradedBy === "ai") return { kind: "card_ai", ref: a.cardId, xp: XP.cardAi };
  return null;
}

/** Card XP already earned on the day: `total` is rule and AI together, `ai` the model's share. */
export type CardUsed = { total: number; ai: number };

/** How much of a card award the day's caps still allow: all of it, part of it or none. */
export function capCard(award: { kind: "card" | "card_ai"; xp: number }, used: CardUsed): number {
  const room = Math.max(0, CARD_DAILY_CAP - used.total);
  const aiRoom = award.kind === "card_ai" ? Math.max(0, AI_CARD_DAILY_CAP - used.ai) : award.xp;
  return Math.min(award.xp, room, aiRoom);
}

/**
 * Whether the bonus for the day is earned: the day's status is done, so every
 * mission that counts toward it is resolved (`dayStatus`: no "coming soon", no
 * revive, no extra). The bonus follows the "Day done" the reader sees and the
 * streak they keep, so a review they set aside ("Not today", "I've got this")
 * does not hold it back; that review earns no review XP either way.
 */
export function dayBonusDue(missions: { status: string; isRevive: boolean; isExtra?: boolean }[]): boolean {
  return dayStatus(missions, false) === "done";
}

export const bonusAward = (day: string): XpAward => ({ kind: "bonus", ref: day, xp: XP.dayBonus });
