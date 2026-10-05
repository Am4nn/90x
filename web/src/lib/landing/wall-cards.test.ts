import { describe, expect, it } from "vitest";
import { PRIMITIVES } from "@/lib/feed/archetypes";
import { nextState } from "@/lib/feed/srs";
import { KIND_COUNT_WORD, WALL_CARDS, type WallCard } from "./wall-cards";

const card = (kind: string): WallCard => WALL_CARDS.find((c) => c.kind === kind)!;
const NOW = new Date("2026-10-05T12:00:00Z");
// The card's snippet, line for line (it is Python on the card).
const findMax = (nums: number[]) => {
  let best = 0;
  for (const n of nums) if (n > best) best = n;
  return best;
};
// Read and write quorums over n replicas must overlap for a read to see the latest acknowledged write.
const overlaps = (n: number, w: number, r: number) => w + r > n;
const days = (dueAt: Date) => (dueAt.getTime() - NOW.getTime()) / 86_400_000;

describe("the wall's cards are the Feed's own", () => {
  it("each is a different primitive the Feed really has", () => {
    const ids: string[] = PRIMITIVES.map((p) => p.id);
    const used = WALL_CARDS.map((c) => c.primitive);
    for (const id of used) expect(ids).toContain(id);
    expect(new Set(used).size).toBe(used.length);
  });

  it("all ten of the Feed's primitives are shown, once each", () => {
    expect(WALL_CARDS).toHaveLength(10);
    expect(WALL_CARDS.map((c) => c.primitive).toSorted()).toEqual(PRIMITIVES.map((p) => p.id as string).toSorted());
  });

  it("the heading counts the Feed's kinds of card", () => {
    const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
    expect(words[PRIMITIVES.length]).toBe(KIND_COUNT_WORD);
  });

  it("a card marked wrong or right says so in the same colour as its rows", () => {
    // An Order card's rows are plain, as in the mock; its mistake is the swapped order itself.
    for (const c of WALL_CARDS.filter((w) => w.kind !== "Order")) {
      const wrong = c.rows.some((r) => r.tone === "bad");
      expect(c.verdictTone, c.kind).toBe(wrong ? "bad" : "ok");
    }
  });

  it("carries no percentage anywhere, since the Feed grades right or wrong", () => {
    const everything = WALL_CARDS.flatMap((c) => [c.prompt, c.verdict, ...c.rows.flatMap((r) => [r.text, r.label, ...(r.cells ?? [])])]);
    for (const text of everything) expect(text, text).not.toMatch(/%/);
  });
});

describe("the facts on the cards", () => {
  it("Number: 8 bits is the fewest that give 200 values their own pattern", () => {
    expect(card("Number").big).toBe("8");
    expect(2 ** 8).toBeGreaterThanOrEqual(200);
    expect(2 ** 7).toBeLessThan(200);
  });

  it("Tap the line: line 2 is the one that breaks find_max, which returns 0 for a list of negatives", () => {
    const lines = card("Tap the line").rows.map((r) => r.text);
    const source = lines.join("\n");
    expect(lines[1]).toBe("    best = 0");
    expect(source).toContain("for n in nums:");
    expect(findMax([3, 9, 4])).toBe(9);
    expect(findMax([-5, -2, -9])).not.toBe(-2);
  });

  it("True or false: with N = 3, W + R > N makes a read overlap the latest write, and W = R = 1 does not", () => {
    const rows = card("True or false").rows;
    expect(rows.map((r) => r.label)).toEqual(["T", "T", "F"]);
    expect(overlaps(3, 2, 2)).toBe(true);
    expect(overlaps(3, 1, 1)).toBe(false);
  });

  it("Order: a TCP connection opens SYN, SYN-ACK, ACK and then carries data before it closes", () => {
    const steps = ["SYN", "SYN-ACK", "ACK", "Data transfer", "FIN"];
    const shown = card("Order").rows.map((r) => r.text);
    // The reader's order swaps the last two, and the rows are plain: the wrong order is the verdict.
    expect(shown).toEqual(["SYN", "SYN-ACK", "ACK", "FIN", "Data transfer"]);
    expect(shown).not.toEqual(steps);
    expect(card("Order").verdictTone).toBe("bad");
  });

  it("Assemble: the tokens make a valid query whose clauses run in SQL's order, and HAVING (not WHERE) filters the groups", () => {
    const lines = card("Assemble").rows.map((r) => r.text);
    const query = lines.join(" ");
    expect(query).toBe("SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id HAVING COUNT(*) > 5");
    const clauses = ["SELECT", "FROM", "GROUP BY", "HAVING"].map((k) => query.indexOf(k));
    expect(clauses.toSorted((a, b) => a - b)).toEqual(clauses);
    expect(query).not.toContain("WHERE");
    // The same grouping and filter over nine orders: only customer 7 has more than 5.
    const orders = [7, 7, 7, 7, 7, 7, 8, 8, 9];
    const counts = new Map<number, number>();
    for (const id of orders) counts.set(id, (counts.get(id) ?? 0) + 1);
    expect([...counts].filter(([, n]) => n > 5).map(([id]) => id)).toEqual([7]);
  });

  it("a card marked 'back tomorrow' is, in the Feed's own scheduler: a first miss is due in one day", () => {
    const missed = nextState(null, 1, NOW);
    expect(days(missed.dueAt)).toBe(1);
    expect(WALL_CARDS.filter((c) => c.verdict.includes("back tomorrow"))).toHaveLength(2);
  });
});
