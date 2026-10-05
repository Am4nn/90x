import { describe, expect, it } from "vitest";
import { type BackfillInput, computeBackfill, summarize } from "./backfill";

const empty: BackfillInput = { checkins: [], studied: [], cards: [], days: [], existing: [] };
const run = (input: Partial<BackfillInput>) => computeBackfill({ ...empty, ...input });

const checkin = (id: string, slug: string, result: "solved" | "hints" | "failed", day: string, time = "10:00") => ({
  id,
  slug,
  result,
  day,
  at: `${day}T${time}:00Z`,
});

const card = (cardId: string, day: string, outcome: string, gradedBy: string, time = "10:00") => ({
  cardId,
  day,
  outcome,
  gradedBy,
  at: `${day}T${time}:00Z`,
});

const m = (status: string, extra: { isRevive?: boolean; isExtra?: boolean } = {}) => ({
  status,
  isRevive: extra.isRevive ?? false,
  isExtra: extra.isExtra ?? false,
});

describe("computeBackfill: check-ins", () => {
  it("pays a first solve 30 and a first solve with hints 20, on the day it was made", () => {
    const rows = run({ checkins: [checkin("1", "a", "solved", "2026-09-27"), checkin("2", "b", "hints", "2026-09-28")] });
    expect(rows).toEqual([
      { kind: "problem", ref: "a", xp: 30, day: "2026-09-27" },
      { kind: "problem", ref: "b", xp: 20, day: "2026-09-28" },
    ]);
  });

  it("pays a problem that failed first its new-problem XP when it is finally solved, and not before", () => {
    const rows = run({ checkins: [checkin("1", "a", "failed", "2026-09-27"), checkin("2", "a", "solved", "2026-09-29")] });
    expect(rows).toEqual([{ kind: "problem", ref: "a", xp: 30, day: "2026-09-29" }]);
  });

  it("does not pay a clean re-solve with no review waiting", () => {
    const rows = run({ checkins: [checkin("1", "a", "solved", "2026-09-27"), checkin("2", "a", "solved", "2026-10-02")] });
    expect(rows).toHaveLength(1);
  });

  it("pays a review once the ladder entry is due: hints then a clean solve 3 days on", () => {
    const rows = run({ checkins: [checkin("1", "a", "hints", "2026-09-27"), checkin("2", "a", "solved", "2026-09-30")] });
    expect(rows).toEqual([
      { kind: "problem", ref: "a", xp: 20, day: "2026-09-27" },
      { kind: "review", ref: "a", xp: 15, day: "2026-09-30" },
    ]);
  });

  it("does not pay a review done before it is due", () => {
    const rows = run({ checkins: [checkin("1", "a", "hints", "2026-09-27"), checkin("2", "a", "solved", "2026-09-28")] });
    expect(rows.map((r) => r.kind)).toEqual(["problem"]);
  });

  it("climbs the whole ladder: hints, then clean solves on day 3, 10 and 31 earn a review each", () => {
    const rows = run({
      checkins: [
        checkin("1", "a", "hints", "2026-09-01"),
        checkin("2", "a", "solved", "2026-09-04"),
        checkin("3", "a", "solved", "2026-09-11"),
        checkin("4", "a", "solved", "2026-10-02"),
        checkin("5", "a", "solved", "2026-10-10"),
      ],
    });
    expect(rows.map((r) => `${r.kind}:${r.xp}`)).toEqual(["problem:20", "review:15", "review:15", "review:15"]);
  });

  it("replays in time order whatever order the rows arrive in", () => {
    const rows = run({ checkins: [checkin("2", "a", "solved", "2026-09-30"), checkin("1", "a", "hints", "2026-09-27")] });
    expect(rows.map((r) => r.kind)).toEqual(["problem", "review"]);
  });

  it("counts a problem once on a day: the same key cannot be paid twice", () => {
    const rows = run({
      checkins: [checkin("1", "a", "hints", "2026-09-27", "08:00"), checkin("2", "a", "solved", "2026-09-27", "09:00")],
    });
    expect(rows).toEqual([{ kind: "problem", ref: "a", xp: 20, day: "2026-09-27" }]);
  });
});

describe("computeBackfill: topics", () => {
  it("pays 20 for each studied topic on the day it was studied", () => {
    const rows = run({
      studied: [
        { slug: "sql-joins", day: "2026-09-30" },
        { slug: "caching", day: "2026-10-01" },
      ],
    });
    expect(rows).toEqual([
      { kind: "topic", ref: "sql-joins", xp: 20, day: "2026-09-30" },
      { kind: "topic", ref: "caching", xp: 20, day: "2026-10-01" },
    ]);
  });
});

describe("computeBackfill: cards", () => {
  const day = "2026-10-01";

  it("pays 2 for a correct rule-graded card and 1 for a correct model-graded one", () => {
    const rows = run({
      cards: [card("c1", day, "correct", "pure"), card("c2", day, "correct", "match"), card("c3", day, "correct", "ai")],
    });
    expect(rows.map((r) => `${r.kind}:${r.xp}`).toSorted()).toEqual(["card:2", "card:2", "card_ai:1"]);
  });

  it("pays nothing for wrong, skipped, declared or self-graded answers", () => {
    const rows = run({
      cards: [
        card("c1", day, "wrong", "pure"),
        card("c2", day, "skipped", "skip"),
        card("c3", day, "new_to_me", "declared"),
        card("c4", day, "correct", "self"),
      ],
    });
    expect(rows).toEqual([]);
  });

  it("pays a card once a day: wrong first, then right, then right again", () => {
    const rows = run({
      cards: [
        card("c1", day, "wrong", "pure", "08:00"),
        card("c1", day, "correct", "pure", "09:00"),
        card("c1", day, "correct", "pure", "10:00"),
      ],
    });
    expect(rows).toEqual([{ kind: "card", ref: "c1", xp: 2, day }]);
  });

  it("pays the same card again on another day", () => {
    const rows = run({ cards: [card("c1", day, "correct", "pure"), card("c1", "2026-10-02", "correct", "pure")] });
    expect(rows).toHaveLength(2);
  });

  it("caps model-graded cards at 10 a day", () => {
    const cards = Array.from({ length: 15 }, (_, i) => card(`ai${i}`, day, "correct", "ai", `10:${String(i).padStart(2, "0")}`));
    const rows = run({ cards });
    expect(summarize(rows)).toEqual({ card_ai: { events: 10, xp: 10 } });
  });

  it("caps all card XP at 100 a day", () => {
    const cards = Array.from({ length: 60 }, (_, i) => card(`c${i}`, day, "correct", "pure", `10:${String(i).padStart(2, "0")}`));
    const rows = run({ cards });
    expect(summarize(rows)).toEqual({ card: { events: 50, xp: 100 } });
  });

  it("counts the model's 10 inside the 100: 10 AI first leaves room for 45 rule cards", () => {
    const ai = Array.from({ length: 10 }, (_, i) => card(`ai${i}`, day, "correct", "ai", `08:${String(i).padStart(2, "0")}`));
    const rule = Array.from({ length: 60 }, (_, i) => card(`c${i}`, day, "correct", "pure", `10:${String(i).padStart(2, "0")}`));
    const total = summarize(run({ cards: [...ai, ...rule] }));
    expect(total.card_ai?.xp).toBe(10);
    expect(total.card?.xp).toBe(90);
  });

  it("applies the caps per day", () => {
    const cards = [
      ...Array.from({ length: 60 }, (_, i) => card(`c${i}`, day, "correct", "pure", `10:${String(i).padStart(2, "0")}`)),
      ...Array.from({ length: 60 }, (_, i) => card(`c${i}`, "2026-10-02", "correct", "pure", `10:${String(i).padStart(2, "0")}`)),
    ];
    expect(summarize(run({ cards })).card).toEqual({ events: 100, xp: 200 });
  });
});

describe("computeBackfill: finished days", () => {
  it("pays the 20 bonus for a day the grid counts as done, and only those days", () => {
    const rows = run({
      days: [
        { date: "2026-09-30", missions: [m("done"), m("done")] },
        { date: "2026-10-01", missions: [m("skipped"), m("skipped")] },
        { date: "2026-10-04", missions: [] },
        { date: "2026-10-02", missions: [m("done"), m("open")] },
        { date: "2026-10-03", missions: [m("done"), m("open", { isExtra: true })] },
      ],
    });
    expect(rows).toEqual([
      { kind: "bonus", ref: "2026-09-30", xp: 20, day: "2026-09-30" },
      { kind: "bonus", ref: "2026-10-01", xp: 20, day: "2026-10-01" },
      { kind: "bonus", ref: "2026-10-03", xp: 20, day: "2026-10-03" },
    ]);
  });
});

describe("computeBackfill: running twice", () => {
  const input = {
    checkins: [checkin("1", "a", "solved", "2026-09-27")],
    studied: [{ slug: "caching", day: "2026-09-28" }],
    cards: [card("c1", "2026-09-29", "correct", "pure")],
    days: [{ date: "2026-09-27", missions: [{ status: "done", isRevive: false, isExtra: false }] }],
  };

  it("adds nothing the second time", () => {
    const first = run(input);
    expect(first).toHaveLength(4);
    expect(run({ ...input, existing: first })).toEqual([]);
  });

  it("counts what is already there toward the caps, and never pays a problem or topic twice", () => {
    const existing = [
      { kind: "card" as const, ref: "x", xp: 98, day: "2026-10-01" },
      { kind: "problem" as const, ref: "a", xp: 30, day: "2026-09-27" },
      { kind: "topic" as const, ref: "caching", xp: 20, day: "2026-10-04" },
    ];
    const rows = run({
      ...input,
      cards: [card("c1", "2026-10-01", "correct", "pure", "10:00"), card("c2", "2026-10-01", "correct", "pure", "10:01")],
      existing,
    });
    expect(rows.filter((r) => r.kind === "card")).toEqual([{ kind: "card", ref: "c1", xp: 2, day: "2026-10-01" }]);
    expect(rows.some((r) => r.kind === "problem" || r.kind === "topic")).toBe(false);
  });
});

describe("summarize", () => {
  it("totals events and XP by kind", () => {
    expect(
      summarize([
        { kind: "problem", ref: "a", xp: 30, day: "2026-09-27" },
        { kind: "problem", ref: "b", xp: 20, day: "2026-09-27" },
        { kind: "bonus", ref: "2026-09-27", xp: 20, day: "2026-09-27" },
      ]),
    ).toEqual({ problem: { events: 2, xp: 50 }, bonus: { events: 1, xp: 20 } });
  });
});
