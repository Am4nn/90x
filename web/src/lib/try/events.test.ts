import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const values = vi.hoisted(() => vi.fn(async () => undefined));
const insert = vi.hoisted(() => vi.fn(() => ({ values })));
vi.mock("@/db", () => ({ db: { insert } }));
vi.mock("@/db/schema", () => ({ tryEvents: { table: "try_events" } }));

import { tryEvents } from "@/db/schema";
import { TRY_CARD_KEYS, TRY_CARDS, TRY_TAB_SLUGS } from "@/lib/landing/try-cards";
import { insertTryEvent, TryEventSchema } from "./events";
import { SECOND_BUCKETS, TRY_KINDS, TRY_SPOTS, TRY_STEPS } from "./steps";

const visit = "a".repeat(16);
const ev = (kind: string, data?: unknown) => TryEventSchema.safeParse({ visit, kind, data });
const good = { visit, kind: "answer", data: { card: "sd", option: 2, correct: true } };

/** Exactly what the client sends (components/try/try-client.tsx), built from the same constants. */
const PAYLOADS: Record<(typeof TRY_KINDS)[number], unknown[]> = {
  view: [undefined, {}],
  listen_start: [undefined, {}],
  listen_95: [undefined, {}],
  tab: TRY_TAB_SLUGS.map((tab) => ({ tab })),
  answer: TRY_CARDS.flatMap((c) => [0, 1, 2, 3].map((option) => ({ card: c.key, option, correct: option === c.correct }))),
  listen_pause: SECOND_BUCKETS.map((at) => ({ at })),
  signin_click: TRY_SPOTS.map((spot) => ({ spot })),
  leave: SECOND_BUCKETS.flatMap((seconds) => TRY_STEPS.map((step) => ({ seconds, step }))),
};

describe("TryEventSchema", () => {
  it("takes every payload the client builds, for every kind", () => {
    for (const kind of TRY_KINDS) {
      expect(PAYLOADS[kind].length, kind).toBeGreaterThan(0);
      for (const data of PAYLOADS[kind]) expect(ev(kind, data).success, `${kind} ${JSON.stringify(data)}`).toBe(true);
    }
  });

  it("keeps the card keys and tab slugs the client uses in step with the cards", () => {
    expect(TRY_CARDS.map((c) => c.key)).toEqual([...TRY_CARD_KEYS]);
    expect(TRY_TAB_SLUGS).toEqual([...TRY_CARD_KEYS, "listen"]);
  });

  it("defaults missing data to an empty object", () => {
    const parsed = ev("view");
    expect(parsed.success && parsed.data.data).toEqual({});
  });

  it("rejects a visit id that is too long, too short or not lowercase letters and digits", () => {
    for (const v of ["a".repeat(40), "a".repeat(15), "A".repeat(16), `${"a".repeat(15)}-`]) {
      expect(TryEventSchema.safeParse({ ...good, visit: v }).success, v).toBe(false);
    }
    expect(TryEventSchema.safeParse({ ...good, visit: "k7m2p9qa0z1x2c3v4b5n6m7q" }).success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(TryEventSchema.safeParse({ ...good, kind: "purchase" }).success).toBe(false);
  });

  it("rejects an extra key, a free-text value, a wrong kind and data pairing, and out-of-range values", () => {
    const bad: [string, unknown][] = [
      ["view", { extra: 1 }],
      ["answer", { ...good.data, extra: 1 }],
      ["answer", { card: "hello", option: 2, correct: true }],
      ["answer", { card: "sd", option: 4, correct: true }],
      ["answer", { card: "sd", option: 1.5, correct: true }],
      ["answer", { card: "sd", option: 2 }],
      ["tab", { card: "sd" }],
      ["tab", { tab: "billing" }],
      ["listen_pause", { at: "7s" }],
      ["signin_click", { spot: "somewhere" }],
      ["leave", { seconds: "30-60" }],
      ["leave", { seconds: "30-60", step: "bought" }],
      ["listen_start", { at: "0-10" }],
      ["tab", { tab: { deep: 1 } }],
    ];
    for (const [kind, data] of bad) expect(ev(kind, data).success, `${kind} ${JSON.stringify(data)}`).toBe(false);
  });
});

describe("insertTryEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes the visit, kind and data into try_events", async () => {
    const data = { card: "sd", option: 2, correct: true } as const;
    await insertTryEvent({ visit, kind: "answer", data });
    expect(insert).toHaveBeenCalledExactlyOnceWith(tryEvents);
    expect(values).toHaveBeenCalledExactlyOnceWith({ visit, kind: "answer", data });
  });
});
