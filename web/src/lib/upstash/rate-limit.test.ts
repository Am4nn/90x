import { beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory INCR/EXPIRE in place of Redis; `down` makes every call throw.
const store = new Map<string, number>();
const state = { down: false };
const incr = vi.fn(async (k: string) => {
  if (state.down) throw new Error("redis down");
  const n = (store.get(k) ?? 0) + 1;
  store.set(k, n);
  return n;
});
const expire = vi.fn(async () => 1);
vi.mock("server-only", () => ({}));
vi.mock("@/lib/upstash/redis", () => ({ redis: () => ({ incr, expire }) }));

const { takeDailyCount } = await import("./rate-limit");
const { DAILY_LIMITS } = await import("./ratelimit");

describe("takeDailyCount", () => {
  const now = Date.UTC(2026, 9, 8, 10);
  beforeEach(() => {
    store.clear();
    state.down = false;
    incr.mockClear();
    expire.mockClear();
  });

  it("allows the daily limit and refuses the next, even when the calls arrive together", async () => {
    const limit = DAILY_LIMITS.shareCount;
    const results = await Promise.all(Array.from({ length: limit + 3 }, () => takeDailyCount("u1", "shareCount", now)));
    expect(results.filter(Boolean)).toHaveLength(limit);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it("counts every invite in a burst sent at once: no more than the day's invites get through", async () => {
    const limit = DAILY_LIMITS.invite;
    const results = await Promise.all(Array.from({ length: 50 }, () => takeDailyCount("u1", "invite", now)));
    expect(results.filter(Boolean)).toHaveLength(limit);
    expect(store.get(`90x:rl:invite:u1:2026-10-08`)).toBe(50);
  });

  it("starts again the next UTC day and keeps people apart", async () => {
    for (let i = 0; i < DAILY_LIMITS.shareCount; i++) await takeDailyCount("u1", "shareCount", now);
    expect(await takeDailyCount("u1", "shareCount", now)).toBe(false);
    expect(await takeDailyCount("u2", "shareCount", now)).toBe(true);
    expect(await takeDailyCount("u1", "shareCount", now + 86_400_000)).toBe(true);
  });

  it("fails closed: nothing is counted while Redis is down", async () => {
    state.down = true;
    expect(await takeDailyCount("u1", "shareCount", now)).toBe(false);
  });
});
