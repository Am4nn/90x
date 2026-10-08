import { beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory GET/SET in place of Redis; `down` makes every call throw.
const store = new Map<string, unknown>();
const state = { down: false };
const get = vi.fn(async (k: string) => {
  if (state.down) throw new Error("redis down");
  const v = store.get(k);
  return typeof v === "string" ? (JSON.parse(v) as unknown) : (v ?? null);
});
const set = vi.fn(async (k: string, v: unknown) => {
  if (state.down) throw new Error("redis down");
  store.set(k, v);
  return "OK";
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/upstash/redis", () => ({ redis: () => ({ get, set }) }));

const { takeMessageSlot, METER_DOWN_RETRY_SEC } = await import("./rate-limit");
const { RATE_LIMIT } = await import("./chat-rules");

describe("takeMessageSlot", () => {
  const now = Date.UTC(2026, 9, 8, 10);
  beforeEach(() => {
    store.clear();
    state.down = false;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("allows the window's allowance and refuses the next", async () => {
    for (let i = 0; i < RATE_LIMIT.limit; i++) expect((await takeMessageSlot("u1", now + i)).allowed).toBe(true);
    const refused = await takeMessageSlot("u1", now + RATE_LIMIT.limit);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSec).toBeGreaterThan(0);
    expect((await takeMessageSlot("u2", now)).allowed).toBe(true);
  });

  it("fails closed when Redis is down, with a retry the 429 copy can show", async () => {
    state.down = true;
    expect(await takeMessageSlot("u1", now)).toEqual({ allowed: false, retryAfterSec: METER_DOWN_RETRY_SEC });
    expect(Math.ceil(METER_DOWN_RETRY_SEC / 60)).toBe(1);
  });

  it("fails closed when the write fails after the read", async () => {
    set.mockRejectedValueOnce(new Error("redis write failed"));
    expect((await takeMessageSlot("u1", now)).allowed).toBe(false);
  });
});
