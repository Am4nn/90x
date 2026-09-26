import { describe, expect, it } from "vitest";
import { isDue, nextState, type SrsState } from "./srs";

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
