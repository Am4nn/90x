import { describe, expect, it } from "vitest";
import { isDue, nextState, RETIRED_DAYS, type SrsState, stretchCorrect } from "./srs";

const now = new Date("2026-09-27T10:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

// A card answered Good twice, now due.
function reviewed(): SrsState {
  const first = nextState(null, 3, days(-20));
  return nextState(first, 3, first.dueAt);
}

describe("nextState", () => {
  it("a new card rated Good is scheduled days out, not minutes", () => {
    const state = nextState(null, 3, now);
    expect(state.dueAt.getTime()).toBeGreaterThanOrEqual(days(1).getTime());
    expect(state.reps).toBe(1);
    expect(state.lapses).toBe(0);
    expect(state.lastReview).toEqual(now);
  });

  it("Again on a reviewed card is a lapse and comes back sooner than Good", () => {
    const prev = reviewed();
    const again = nextState(prev, 1, now);
    const good = nextState(prev, 3, now);
    expect(again.lapses).toBe(prev.lapses + 1);
    expect(good.lapses).toBe(prev.lapses);
    expect(again.dueAt.getTime()).toBeLessThan(good.dueAt.getTime());
  });

  it("Easy is scheduled later than Good", () => {
    expect(nextState(null, 4, now).dueAt.getTime()).toBeGreaterThan(nextState(null, 3, now).dueAt.getTime());
    const prev = reviewed();
    expect(nextState(prev, 4, now).dueAt.getTime()).toBeGreaterThan(nextState(prev, 3, now).dueAt.getTime());
  });

  it("is deterministic", () => {
    expect(nextState(reviewed(), 3, now)).toEqual(nextState(reviewed(), 3, now));
  });

  it("keeps a Good card moving out after it was stored and reloaded", () => {
    const first = nextState(null, 3, now);
    const reloaded: SrsState = { ...first, dueAt: new Date(first.dueAt), lastReview: first.lastReview };
    const second = nextState(reloaded, 3, first.dueAt);
    expect(second.dueAt.getTime() - first.dueAt.getTime()).toBeGreaterThan(first.dueAt.getTime() - now.getTime());
  });
});

describe("isDue", () => {
  it("new cards are new, not due", () => {
    expect(isDue(null, now)).toBe(false);
  });

  it("is due from its due date on", () => {
    const state = nextState(null, 3, now);
    expect(isDue(state, now)).toBe(false);
    expect(isDue(state, state.dueAt)).toBe(true);
    expect(isDue(state, days(365))).toBe(true);
  });
});

const due = (state: SrsState) => Math.round((state.dueAt.getTime() - now.getTime()) / 86_400_000);

const next = (dueDays: number): SrsState => ({
  stability: 3,
  difficulty: 5,
  dueAt: days(dueDays),
  reps: 1,
  lapses: 0,
  state: 2,
  lastReview: now,
});

describe("stretchCorrect", () => {
  it("holds a correct answer for at least its floor: a week for Hard, two for Good, a month for Easy", () => {
    expect(due(stretchCorrect(next(1), { rating: 2, now, retire: false }))).toBe(7);
    expect(due(stretchCorrect(next(3), { rating: 3, now, retire: false }))).toBe(14);
    expect(due(stretchCorrect(next(3), { rating: 4, now, retire: false }))).toBe(30);
  });

  it("keeps the scheduler's date when it is already later than the floor", () => {
    expect(due(stretchCorrect(next(60), { rating: 4, now, retire: false }))).toBe(60);
  });

  it("takes a retired card out of rotation for the campaign", () => {
    expect(due(stretchCorrect(next(3), { rating: 4, now, retire: true }))).toBe(RETIRED_DAYS);
  });

  it("leaves a miss to the scheduler so it comes back soon", () => {
    const miss = next(1);
    expect(stretchCorrect(miss, { rating: 1, now, retire: false })).toBe(miss);
    expect(stretchCorrect(miss, { rating: 1, now, retire: true })).toBe(miss);
  });
});
