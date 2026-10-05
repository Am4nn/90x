import { describe, expect, it } from "vitest";
import { MIX_CAP, MIX_WINDOW, type MixCard, pickBalanced } from "./mix";

const card = (kind: string, area: string): MixCard => ({ kind, area });
const many = (n: number, kind: string, area: string) => Array.from({ length: n }, () => card(kind, area));

describe("pickBalanced", () => {
  it("returns -1 for no candidates", () => {
    expect(pickBalanced([], [])).toBe(-1);
  });

  it("takes the top candidate when nothing is near the cap", () => {
    expect(pickBalanced([], [card("a", "x"), card("b", "y")])).toBe(0);
    expect(pickBalanced(many(5, "a", "x"), [card("a", "x")])).toBe(0);
  });

  it("allows the 6th of a kind in the window and blocks the 7th", () => {
    expect(pickBalanced(many(MIX_CAP - 1, "a", "x"), [card("a", "y"), card("b", "y")])).toBe(0);
    expect(pickBalanced(many(MIX_CAP, "a", "x"), [card("a", "y"), card("b", "y")])).toBe(1);
  });

  it("allows three in a row", () => {
    expect(pickBalanced(many(2, "a", "x"), [card("a", "x")])).toBe(0);
  });

  it("blocks on area as well as kind", () => {
    const recent = [...many(6, "a", "x"), ...many(3, "b", "y")];
    // Kind a and area x are both full: a/y and b/x break one cap each, c/z none.
    expect(pickBalanced(recent, [card("a", "y"), card("b", "x"), card("c", "z")])).toBe(2);
  });

  it("keeps rank order among cards that fit (due priority)", () => {
    const recent = many(6, "a", "x");
    expect(pickBalanced(recent, [card("a", "x"), card("b", "x"), card("c", "y"), card("d", "y")])).toBe(2);
    // A top-ranked due card that fits is not jumped.
    expect(pickBalanced(many(3, "a", "x"), [card("b", "y"), card("c", "z")])).toBe(0);
  });

  it("only counts the latest 9 served, newest first", () => {
    // Newest first: 3 b, then 6 a, then older a's that are outside the window.
    const recent = [...many(3, "b", "y"), ...many(5, "a", "x"), ...many(1, "c", "y"), ...many(5, "a", "x")];
    // Within the latest 9 there are 5 a's, so a 6th fits.
    expect(pickBalanced(recent, [card("a", "z")])).toBe(0);
    // 6 a's inside the latest 9 means a 7th does not.
    const full = [...many(6, "a", "x"), ...many(3, "b", "y")];
    expect(pickBalanced(full, [card("a", "z"), card("q", "z")])).toBe(1);
  });

  it("serves the top candidate when every one breaks the same caps", () => {
    expect(pickBalanced(many(9, "a", "x"), [card("a", "x"), card("a", "x")])).toBe(0);
  });

  it("prefers the candidate that breaks fewer caps", () => {
    const recent = [...many(6, "a", "x"), ...many(3, "b", "y")];
    // a/x breaks both caps, a/y only the kind cap.
    expect(pickBalanced(recent, [card("a", "x"), card("a", "y")])).toBe(1);
  });

  it("serves a single-kind pool", () => {
    expect(pickBalanced(many(9, "a", "x"), [card("a", "y"), card("a", "z")])).toBe(0);
  });

  it("with the area cap off, one area is never blocked", () => {
    const recent = many(9, "a", "x");
    expect(pickBalanced(recent, [card("b", "x")], { capAreas: false })).toBe(0);
    // The kind cap still bites.
    expect(pickBalanced(recent, [card("a", "x"), card("b", "x")], { capAreas: false })).toBe(1);
  });

  it("is deterministic: equal candidates keep the first", () => {
    const candidates = [card("b", "y"), card("b", "y"), card("b", "y")];
    expect(pickBalanced([], candidates)).toBe(0);
    expect(pickBalanced(many(9, "a", "x"), candidates)).toBe(0);
  });
});

// Serves a whole session from a ranked pool the way the service does: the
// first 20 of the queue are the candidates, the picked one leaves the queue.
function simulate(pool: MixCard[], serves: number, options: { capAreas?: boolean } = {}): MixCard[] {
  const queue = [...pool];
  const served: MixCard[] = [];
  while (served.length < serves && queue.length) {
    const index = pickBalanced(served.toReversed(), queue.slice(0, 20), options);
    served.push(queue.splice(index, 1)[0]!);
  }
  return served;
}

function worstCount(served: MixCard[], field: keyof MixCard): number {
  let worst = 0;
  for (let i = 0; i + MIX_WINDOW <= served.length; i++) {
    const counts = new Map<string, number>();
    for (const c of served.slice(i, i + MIX_WINDOW)) counts.set(c[field], (counts.get(c[field]) ?? 0) + 1);
    worst = Math.max(worst, ...counts.values());
  }
  return worst;
}

describe("simulated sessions", () => {
  // 60% of the ranked cards are one kind in one area.
  const skewed = Array.from({ length: 200 }, (_, i) => (i % 5 < 2 ? card(["b", "c", "d"][i % 3]!, ["y", "z"][i % 2]!) : card("a", "x")));

  it("holds the cap over a long skewed session", () => {
    const served = simulate(skewed, 30);
    expect(served).toHaveLength(30);
    expect(worstCount(served, "kind")).toBeLessThanOrEqual(MIX_CAP);
    expect(worstCount(served, "area")).toBeLessThanOrEqual(MIX_CAP);
  });

  it("holds the cap on an evenly mixed pool", () => {
    const pool = Array.from({ length: 120 }, (_, i) => card(`k${i % 4}`, `a${i % 3}`));
    const served = simulate(pool, 100);
    expect(worstCount(served, "kind")).toBeLessThanOrEqual(MIX_CAP);
    expect(worstCount(served, "area")).toBeLessThanOrEqual(MIX_CAP);
  });

  it("never starves: one kind in one area is served to the end", () => {
    expect(simulate(many(40, "a", "x"), 40)).toHaveLength(40);
  });

  it("with one allowed area, kinds are still capped and nothing is blocked", () => {
    const pool = Array.from({ length: 100 }, (_, i) => (i % 3 === 0 ? card("b", "x") : card("a", "x")));
    const served = simulate(pool, 40, { capAreas: false });
    expect(served).toHaveLength(40);
    expect(worstCount(served, "kind")).toBeLessThanOrEqual(MIX_CAP);
  });

  it("is repeatable", () => {
    expect(simulate(skewed, 60)).toEqual(simulate(skewed, 60));
  });
});
