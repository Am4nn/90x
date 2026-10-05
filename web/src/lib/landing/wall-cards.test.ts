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

  it("the heading counts the Feed's kinds of card", () => {
    const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
    expect(words[PRIMITIVES.length]).toBe(KIND_COUNT_WORD);
  });

  it("a card marked wrong or right says so in the same colour as its rows", () => {
    for (const c of WALL_CARDS) {
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
    // The reader's order swaps the last two; the tones mark exactly those.
    expect(shown).toEqual(["SYN", "SYN-ACK", "ACK", "FIN", "Data transfer"]);
    expect(
      card("Order")
        .rows.filter((r) => r.tone === "bad")
        .map((r) => steps.indexOf(r.text)),
    ).toEqual([4, 3]);
  });

  it("a card marked 'back tomorrow' is, in the Feed's own scheduler: a first miss is due in one day", () => {
    const missed = nextState(null, 1, NOW);
    expect(days(missed.dueAt)).toBe(1);
    expect(WALL_CARDS.filter((c) => c.verdict.includes("back tomorrow"))).toHaveLength(2);
  });
});
