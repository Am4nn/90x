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

const { takeDailyCount, takeTryEventSlot } = await import("./rate-limit");
const { DAILY_LIMITS, SLOT_LIMITS } = await import("./ratelimit");

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

describe("takeTryEventSlot", () => {
  const now = Date.UTC(2026, 9, 10, 10, 30);
  const { limit, windowMs } = SLOT_LIMITS.tryEvent;
  beforeEach(() => {
    store.clear();
    state.down = false;
    incr.mockClear();
    expire.mockClear();
  });

  it("allows the hour's events and refuses the rest, even when they arrive together", async () => {
    const results = await Promise.all(Array.from({ length: limit + 5 }, () => takeTryEventSlot("203.0.113.9", now)));
    expect(results.filter(Boolean)).toHaveLength(limit);
    expect(expire).toHaveBeenCalledExactlyOnceWith(expect.any(String), windowMs / 1000);
  });

  it("keys the window by a hash of the address, never the address itself", async () => {
    await takeTryEventSlot("203.0.113.9", now);
    const [k] = [...store.keys()];
    expect(k).toMatch(/^90x:try:[0-9a-f]{64}:\d+$/);
    expect(k).not.toContain("203.0.113.9");
  });

  it("counts a whole IPv6 /64 as one address, and keeps other /64s and IPv4 apart", async () => {
    await takeTryEventSlot("2001:db8:1:2::1", now);
    await takeTryEventSlot("2001:0DB8:0001:0002:ffff:eeee:dddd:cccc", now);
    expect(store.size).toBe(1);
    await takeTryEventSlot("2001:db8:1:3::1", now);
    await takeTryEventSlot("198.51.100.7", now);
    expect(store.size).toBe(3);
    // An IPv4-mapped IPv6 counts as its IPv4, not as the shared ::ffff /64.
    await takeTryEventSlot("::ffff:198.51.100.7", now);
    await takeTryEventSlot("::ffff:192.0.2.1", now);
    expect(store.size).toBe(4);
  });

  it("starts again in the next window", async () => {
    for (let i = 0; i < limit; i++) await takeTryEventSlot("203.0.113.9", now);
    expect(await takeTryEventSlot("203.0.113.9", now)).toBe(false);
    expect(await takeTryEventSlot("203.0.113.9", now + windowMs)).toBe(true);
  });

  it("fails closed: nothing is let through while Redis is down", async () => {
    state.down = true;
    expect(await takeTryEventSlot("203.0.113.9", now)).toBe(false);
  });
});
