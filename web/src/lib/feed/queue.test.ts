import { describe, expect, it } from "vitest";
import { type Difficulty } from "./difficulty";
import { buildQueue, type QueueCard, type QueueItem, type QueueReason } from "./queue";

// `count` cards with ids prefix-0, prefix-1, … cycling through `topics`
// (by default seven topics of their own, so pools never share a topic).
function cards(prefix: string, count: number, topics?: string[], difficulty: Difficulty = "Medium"): QueueCard[] {
  const cycle = topics ?? Array.from({ length: 7 }, (_, i) => `${prefix}${i}`);
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}`, topic: cycle[i % cycle.length] ?? "", area: "cs", difficulty }));
}

const reasons = (queue: QueueItem[]) => ({
  weak: queue.filter((item) => item.reason === "weak").length,
  due: queue.filter((item) => item.reason === "due").length,
  new: queue.filter((item) => item.reason === "new").length,
});

const topicOf = (all: QueueCard[]) => {
  const byId = new Map(all.map((card) => [card.id, card.topic]));
  return (item: QueueItem) => byId.get(item.id);
};

const idsWith = (queue: QueueItem[], reason: QueueReason) => queue.filter((item) => item.reason === reason).map((item) => item.id);

// Enough of every difficulty in each pool that the favoured one cannot crowd the
// others out of a single refill, with seven topics apiece for the topic rule.
function pool(prefix: string): QueueCard[] {
  return Array.from({ length: 90 }, (_, i) => ({
    id: `${prefix}-${i}`,
    topic: `${prefix}-t${i % 7}`,
    area: "cs",
    difficulty: (["Easy", "Medium", "Hard"] as const)[i % 3]!,
  }));
}

describe("buildQueue", () => {
  it("mixes 50% weak, 30% due and 20% new", () => {
    const queue = buildQueue({ weak: cards("w", 40), due: cards("d", 40), fresh: cards("n", 40) });
    expect(queue).toHaveLength(30);
    expect(reasons(queue)).toEqual({ weak: 15, due: 9, new: 6 });
  });

  it("keeps each pool's order", () => {
    const weak = cards("w", 40);
    const queue = buildQueue({ weak, due: cards("d", 40), fresh: cards("n", 40) });
    expect(idsWith(queue, "weak")).toEqual(weak.slice(0, 15).map((card) => card.id));
    expect(idsWith(queue, "new")).toEqual(["n-0", "n-1", "n-2", "n-3", "n-4", "n-5"]);
  });

  it("spreads the pools through the queue instead of stacking them", () => {
    const queue = buildQueue({ weak: cards("w", 40), due: cards("d", 40), fresh: cards("n", 40) });
    expect(reasons(queue.slice(0, 10))).toEqual({ weak: 5, due: 3, new: 2 });
  });

  it("scales the mix to the size", () => {
    const queue = buildQueue({ weak: cards("w", 40), due: cards("d", 40), fresh: cards("n", 40), size: 10 });
    expect(reasons(queue)).toEqual({ weak: 5, due: 3, new: 2 });
  });

  it("backfills a short pool from the others in order weak, due, new", () => {
    const short = buildQueue({ weak: cards("w", 4), due: cards("d", 12), fresh: cards("n", 40) });
    expect(reasons(short)).toEqual({ weak: 4, due: 12, new: 14 });

    const noDue = buildQueue({ weak: cards("w", 40), due: [], fresh: cards("n", 40) });
    expect(reasons(noDue)).toEqual({ weak: 24, due: 0, new: 6 });
  });

  it("returns fewer items when all pools together are short", () => {
    const queue = buildQueue({ weak: cards("w", 2), due: cards("d", 1), fresh: cards("n", 3) });
    expect(reasons(queue)).toEqual({ weak: 2, due: 1, new: 3 });
  });

  it("never serves the same card twice; the first pool to pick it wins", () => {
    const shared = { id: "x", topic: "t9", area: "cs", difficulty: "Medium" as const };
    const queue = buildQueue({ weak: [shared, ...cards("w", 3)], due: [shared, ...cards("d", 3)], fresh: [shared] });
    const ids = queue.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(queue.find((item) => item.id === "x")?.reason).toBe("weak");
    expect(queue).toHaveLength(7);
  });

  it("never puts the same topic twice in a row when it can be avoided", () => {
    const weak = cards("w", 20, ["a"]);
    const due = cards("d", 20, ["b"]);
    const fresh = cards("n", 20, ["c", "d"]);
    const queue = buildQueue({ weak, due, fresh });
    const topic = topicOf([...weak, ...due, ...fresh]);
    for (let i = 1; i < queue.length; i++) {
      expect(topic(queue[i] as QueueItem)).not.toBe(topic(queue[i - 1] as QueueItem));
    }
  });

  it("does not repeat the topic of the card just seen", () => {
    const weak = cards("w", 3, ["a"]);
    const due = cards("d", 3, ["b"]);
    const queue = buildQueue({ weak, due, fresh: [], size: 6, lastTopic: "a" });
    expect(queue.map(topicOf([...weak, ...due]))).toEqual(["b", "a", "b", "a", "b", "a"]);
  });

  it("allows repeats when every card has the same topic", () => {
    const weak = cards("w", 5, ["a"]);
    const queue = buildQueue({ weak, due: [], fresh: [], lastTopic: "a" });
    expect(queue.map((item) => item.id)).toEqual(weak.map((card) => card.id));
  });

  it("repeats as little as possible when some repeats are unavoidable", () => {
    const weak = cards("w", 4, ["a"]);
    const due = cards("d", 1, ["b"]);
    const queue = buildQueue({ weak, due, fresh: [] });
    expect(queue.map(topicOf([...weak, ...due]))).toEqual(["a", "b", "a", "a", "a"]);
  });

  it("is deterministic", () => {
    const input = { weak: cards("w", 40, ["a", "b"]), due: cards("d", 40, ["b"]), fresh: cards("n", 40, ["c"]) };
    expect(buildQueue(input)).toEqual(buildQueue(input));
  });

  it("returns [] for no cards", () => {
    expect(buildQueue({ weak: [], due: [], fresh: [] })).toEqual([]);
    expect(buildQueue({ weak: cards("w", 3), due: [], fresh: [], size: 0 })).toEqual([]);
  });

  it("biases toward the mix without dropping a difficulty or repeating a topic", () => {
    const weak = pool("w");
    const due = pool("d");
    const fresh = pool("n");
    const byId = new Map([...weak, ...due, ...fresh].map((card) => [card.id, card]));

    const hardQueue = buildQueue({ weak, due, fresh, mix: { easy: 0.15, medium: 0.35, hard: 0.5 } });
    const easyQueue = buildQueue({ weak, due, fresh, mix: { easy: 0.5, medium: 0.35, hard: 0.15 } });

    const count = (queue: QueueItem[], difficulty: Difficulty) =>
      queue.filter((item) => byId.get(item.id)?.difficulty === difficulty).length;

    expect(count(hardQueue, "Hard")).toBeGreaterThan(count(easyQueue, "Hard"));
    expect(count(easyQueue, "Easy")).toBeGreaterThan(count(hardQueue, "Easy"));
    for (const difficulty of ["Easy", "Medium", "Hard"] as const) {
      expect(count(hardQueue, difficulty)).toBeGreaterThan(0);
      expect(count(easyQueue, difficulty)).toBeGreaterThan(0);
    }

    // The difficulty bias must not break the no-two-in-a-row rule.
    for (const queue of [hardQueue, easyQueue]) {
      for (let i = 1; i < queue.length; i++) {
        expect(byId.get(queue[i]!.id)?.topic).not.toBe(byId.get(queue[i - 1]!.id)?.topic);
      }
    }
  });
});
