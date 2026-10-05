import { describe, expect, it } from "vitest";
import type { Review } from "@/lib/tracker/ladder";
import { AI_CARD_DAILY_CAP, capCard, CARD_DAILY_CAP, cardAward, checkinAward, dayBonusDue, topicAward, XP } from "./rules";

const day = "2026-10-05";
const due = (dueDate: string, status: Review["status"] = "active"): Review => ({ step: 1, dueDate, status });
const m = (status: string, extra: { isRevive?: boolean; isExtra?: boolean } = {}) => ({
  status,
  isRevive: extra.isRevive ?? false,
  isExtra: extra.isExtra ?? false,
});
const answer = (outcome: string, gradedBy: string) => cardAward({ cardId: "c1", outcome, gradedBy });
const base = { slug: "two-sum", day, firstSolve: false, review: null } as const;

describe("checkinAward", () => {
  it("pays 30 for a new problem solved and 20 when it took hints", () => {
    expect(checkinAward({ ...base, result: "solved", firstSolve: true })).toEqual({ kind: "problem", ref: "two-sum", xp: 30 });
    expect(checkinAward({ ...base, result: "hints", firstSolve: true })).toEqual({ kind: "problem", ref: "two-sum", xp: 20 });
  });

  it("pays nothing for a failed attempt, first or not", () => {
    expect(checkinAward({ ...base, result: "failed", firstSolve: true })).toBeNull();
    expect(checkinAward({ ...base, result: "failed", review: due(day) })).toBeNull();
  });

  it("pays 15 for a review done: a clean solve of a due ladder entry", () => {
    expect(checkinAward({ ...base, result: "solved", review: due(day) })).toEqual({ kind: "review", ref: "two-sum", xp: 15 });
    expect(checkinAward({ ...base, result: "solved", review: due("2026-10-01") })?.xp).toBe(XP.review);
  });

  it("does not pay a review that is not due yet, or one that is already off the ladder", () => {
    expect(checkinAward({ ...base, result: "solved", review: due("2026-10-08") })).toBeNull();
    expect(checkinAward({ ...base, result: "solved", review: due(day, "graduated") })).toBeNull();
    expect(checkinAward({ ...base, result: "solved", review: due(day, "dismissed") })).toBeNull();
  });

  it("does not pay a review that needed hints: the ladder starts it over", () => {
    expect(checkinAward({ ...base, result: "hints", review: due(day) })).toBeNull();
  });

  it("does not pay a problem solved again with no review waiting", () => {
    expect(checkinAward({ ...base, result: "solved" })).toBeNull();
  });

  it("pays the new-problem amount, not the review one, when a solve is both", () => {
    expect(checkinAward({ ...base, result: "solved", firstSolve: true, review: due(day) })?.kind).toBe("problem");
  });
});

describe("topicAward", () => {
  it("pays 20", () => {
    expect(topicAward("sql-joins")).toEqual({ kind: "topic", ref: "sql-joins", xp: 20 });
  });
});

describe("cardAward", () => {
  it("pays 2 for a correct answer graded by a rule", () => {
    expect(answer("correct", "pure")).toEqual({ kind: "card", ref: "c1", xp: 2 });
    expect(answer("correct", "match")).toEqual({ kind: "card", ref: "c1", xp: 2 });
  });

  it("pays 1 for a correct answer the model graded, in its own kind so it can be capped", () => {
    expect(answer("correct", "ai")).toEqual({ kind: "card_ai", ref: "c1", xp: 1 });
  });

  it("pays nothing for a wrong answer, a skip or a declaration", () => {
    expect(answer("wrong", "pure")).toBeNull();
    expect(answer("skipped", "skip")).toBeNull();
    expect(answer("new_to_me", "declared")).toBeNull();
    expect(answer("known", "declared")).toBeNull();
  });

  it("pays nothing for a grade the reader gave themselves", () => {
    expect(answer("correct", "self")).toBeNull();
    expect(answer("correct", "options")).toBeNull();
    expect(answer("correct", "declared")).toBeNull();
  });
});

describe("capCard", () => {
  it("lets a card through under the caps", () => {
    expect(capCard({ kind: "card", xp: 2 }, { total: 0, ai: 0 })).toBe(2);
  });

  it("stops model-graded cards at 10 a day", () => {
    expect(AI_CARD_DAILY_CAP).toBe(10);
    expect(capCard({ kind: "card_ai", xp: 1 }, { total: 9, ai: 9 })).toBe(1);
    expect(capCard({ kind: "card_ai", xp: 1 }, { total: 10, ai: 10 })).toBe(0);
  });

  it("keeps the model's cap from touching rule-graded cards", () => {
    expect(capCard({ kind: "card", xp: 2 }, { total: 10, ai: 10 })).toBe(2);
  });

  it("stops all card XP at 100 a day, model-graded included", () => {
    expect(CARD_DAILY_CAP).toBe(100);
    expect(capCard({ kind: "card", xp: 2 }, { total: 98, ai: 0 })).toBe(2);
    expect(capCard({ kind: "card", xp: 2 }, { total: 99, ai: 0 })).toBe(1);
    expect(capCard({ kind: "card", xp: 2 }, { total: 100, ai: 0 })).toBe(0);
    expect(capCard({ kind: "card_ai", xp: 1 }, { total: 100, ai: 4 })).toBe(0);
  });

  it("counts the model's share inside the day's 100, so 10 AI plus 45 rule cards fills it", () => {
    expect(10 + 45 * 2).toBe(CARD_DAILY_CAP);
    expect(capCard({ kind: "card", xp: 2 }, { total: 10 + 44 * 2, ai: 10 })).toBe(2);
    expect(capCard({ kind: "card", xp: 2 }, { total: 10 + 45 * 2, ai: 10 })).toBe(0);
  });
});

describe("dayBonusDue", () => {
  it("is earned when every mission that counts is done", () => {
    expect(dayBonusDue([m("done"), m("done"), m("done")])).toBe(true);
  });

  it("follows the day's status: a review set aside counts as resolved, so the bonus is still earned", () => {
    expect(dayBonusDue([m("done"), m("skipped")])).toBe(true);
  });

  it("is not earned while one is still open", () => {
    expect(dayBonusDue([m("done"), m("open")])).toBe(false);
  });

  it("ignores extras, revive missions and ones that are coming soon", () => {
    expect(dayBonusDue([m("done"), m("open", { isExtra: true }), m("open", { isRevive: true }), m("coming_soon")])).toBe(true);
  });

  it("is not earned by a day with nothing to do", () => {
    expect(dayBonusDue([])).toBe(false);
    expect(dayBonusDue([m("done", { isExtra: true })])).toBe(false);
  });
});
