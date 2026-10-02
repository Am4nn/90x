import { describe, expect, it } from "vitest";
import type { CardView } from "@/lib/feed/view";
import { cardsNeedRefresh, flushOutbox, nextOfflineCard, type OutboxItem, pendingFor, syncedLine } from "./outbox";

const card = (id: string): CardView => ({
  id,
  primitive: "pick_one",
  archetype: "concept",
  difficulty: null,
  promptMd: `Question ${id}`,
  options: null,
  whyOptions: null,
  rubric: null,
  numeric: null,
  topic: { slug: "t", name: "Topic", area: "cs" },
  reason: "new",
  sourceTitle: null,
  canDeclareKnown: false,
  diagnostic: null,
});

const item = (clientId: string, queuedAt: number, overrides: Partial<OutboxItem> = {}): OutboxItem => ({
  clientId,
  userId: "u1",
  input: { cardId: `card-${clientId}`, answer: "an answer", clientId },
  queuedAt,
  ...overrides,
});

const session = { answered: 3, correct: 2, skipped: 0, openMissions: 1 };
const graded = { result: {}, session };

function outbox(items: OutboxItem[]) {
  const saved = new Map(items.map((i) => [i.clientId, i]));
  return {
    saved,
    remove: async (removed: OutboxItem) => {
      saved.delete(removed.clientId);
    },
  };
}

describe("pendingFor", () => {
  it("keeps only this user's answers, oldest first", () => {
    const items = [item("b", 20), item("x", 5, { userId: "u2" }), item("a", 10)];
    expect(pendingFor(items, "u1").map((i) => i.clientId)).toEqual(["a", "b"]);
  });
});

describe("nextOfflineCard", () => {
  it("serves the first cached card not already answered offline", () => {
    expect(nextOfflineCard([card("1"), card("2"), card("3")], ["1", "3"])?.id).toBe("2");
  });
  it("is null when every cached card is answered", () => {
    expect(nextOfflineCard([card("1")], ["1"])).toBeNull();
    expect(nextOfflineCard([], [])).toBeNull();
  });
});

describe("cardsNeedRefresh", () => {
  const now = 1_000_000_000;
  const plenty = Array.from({ length: 20 }, (_, i) => card(String(i)));
  const few = [card("1")];
  it("refreshes when nothing is cached or the copy is old", () => {
    expect(cardsNeedRefresh(null, now)).toBe(true);
    expect(cardsNeedRefresh({ cards: plenty, savedAt: now - 31 * 60_000 }, now)).toBe(true);
  });
  it("leaves a recent copy alone, however short, unless asked to top up", () => {
    expect(cardsNeedRefresh({ cards: plenty, savedAt: now - 5 * 60_000 }, now)).toBe(false);
    expect(cardsNeedRefresh({ cards: few, savedAt: now - 5 * 60_000 }, now)).toBe(false);
  });
  it("tops up a short copy, but not more than every couple of minutes", () => {
    expect(cardsNeedRefresh({ cards: few, savedAt: now - 5 * 60_000 }, now, { topUp: true })).toBe(true);
    expect(cardsNeedRefresh({ cards: few, savedAt: now - 30_000 }, now, { topUp: true })).toBe(false);
    expect(cardsNeedRefresh({ cards: plenty, savedAt: now - 5 * 60_000 }, now, { topUp: true })).toBe(false);
  });
});

describe("flushOutbox", () => {
  it("sends answers one by one, in order, and removes each once graded", async () => {
    const items = [item("a", 1), item("b", 2), item("c", 3)];
    const store = outbox(items);
    const sent: string[] = [];
    const summary = await flushOutbox(items, {
      ...store,
      submit: async (input) => {
        sent.push(input.clientId);
        return graded;
      },
    });
    expect(sent).toEqual(["a", "b", "c"]);
    expect(summary).toEqual({ graded: 3, dropped: 0, left: 0, session });
    expect(store.saved.size).toBe(0);
  });

  it("counts an answer the server already has as graded", async () => {
    const items = [item("a", 1)];
    const store = outbox(items);
    const summary = await flushOutbox(items, { ...store, submit: async () => ({ duplicate: true }) });
    expect(summary).toEqual({ graded: 1, dropped: 0, left: 0, session: null });
    expect(store.saved.size).toBe(0);
  });

  it("stops at a network failure and keeps that answer and the rest", async () => {
    const items = [item("a", 1), item("b", 2), item("c", 3)];
    const store = outbox(items);
    let calls = 0;
    const summary = await flushOutbox(items, {
      ...store,
      submit: async () => {
        calls++;
        if (calls === 2) throw new TypeError("Failed to fetch");
        return graded;
      },
    });
    expect(summary).toEqual({ graded: 1, dropped: 0, left: 2, session });
    expect([...store.saved.keys()]).toEqual(["b", "c"]);
  });

  it("keeps an answer the server couldn't save for now, and stops so order holds", async () => {
    const items = [item("a", 1), item("b", 2)];
    const store = outbox(items);
    const summary = await flushOutbox(items, { ...store, submit: async () => ({ error: "Your answer didn't save.", retry: true }) });
    expect(summary).toEqual({ graded: 0, dropped: 0, left: 2, session: null });
    expect([...store.saved.keys()]).toEqual(["a", "b"]);
  });

  it("keeps an answer that AI grading couldn't mark, however many times it's tried", async () => {
    const items = [item("a", 1), item("b", 2)];
    const store = outbox(items);
    for (let run = 0; run < 5; run++) {
      const summary = await flushOutbox(items, { ...store, submit: async () => ({ needsSelfMark: true }) });
      expect(summary).toEqual({ graded: 0, dropped: 0, left: 2, session: null });
    }
    expect([...store.saved.keys()]).toEqual(["a", "b"]);
  });

  it("drops an answer the server refuses for good, and moves on", async () => {
    const items = [item("a", 1), item("b", 2)];
    const store = outbox(items);
    const summary = await flushOutbox(items, {
      ...store,
      submit: async (input) => (input.clientId === "a" ? { error: "That card is no longer in the feed." } : graded),
    });
    expect(summary).toEqual({ graded: 1, dropped: 1, left: 0, session });
    expect(store.saved.size).toBe(0);
  });

  it("does nothing with an empty outbox", async () => {
    const summary = await flushOutbox([], { ...outbox([]), submit: async () => graded });
    expect(summary).toEqual({ graded: 0, dropped: 0, left: 0, session: null });
  });
});

describe("syncedLine", () => {
  it("says how many offline answers were graded or lost", () => {
    expect(syncedLine({ graded: 3, dropped: 0, left: 0, session: null })).toBe("3 answers graded");
    expect(syncedLine({ graded: 1, dropped: 0, left: 0, session: null })).toBe("1 answer graded");
    expect(syncedLine({ graded: 2, dropped: 1, left: 0, session: null })).toBe("2 answers graded. 1 couldn't be graded.");
    expect(syncedLine({ graded: 0, dropped: 2, left: 0, session: null })).toBe("2 offline answers couldn't be graded.");
  });
  it("is null when nothing was sent", () => {
    expect(syncedLine({ graded: 0, dropped: 0, left: 4, session: null })).toBeNull();
  });
});
