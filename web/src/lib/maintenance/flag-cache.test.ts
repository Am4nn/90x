import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { swrValue } from "./flag-cache";

// The proxy asks this on every request, so the owner's rule is pinned here: no network call on a
// warm hit, a background refresh after the TTL, one awaited load on a cold instance, and any
// failure reads as live.

const TTL = 10_000;
const TIMEOUT = 1_500;
const LIVE = { on: false };
const ON = { on: true };

function setup(load: () => Promise<{ on: boolean }>) {
  const onError = vi.fn();
  const cache = swrValue({ load, fallback: LIVE, ttlMs: TTL, timeoutMs: TIMEOUT, onError });
  return { cache, onError };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("swrValue", () => {
  it("cold start: the first caller waits for one load, and callers meanwhile share it", async () => {
    let resolve!: (v: { on: boolean }) => void;
    const load = vi.fn(() => new Promise<{ on: boolean }>((r) => (resolve = r)));
    const { cache } = setup(load);
    const first = cache.get();
    const second = cache.get();
    expect(load).toHaveBeenCalledTimes(1);
    resolve(ON);
    expect(await first).toEqual(ON);
    expect(await second).toEqual(ON);
  });

  it("warm hit within the TTL: no load at all", async () => {
    const load = vi.fn(async () => ON);
    const { cache } = setup(load);
    await cache.get();
    for (let i = 0; i < 50; i++) {
      vi.advanceTimersByTime(TTL / 100);
      expect(await cache.get()).toEqual(ON);
    }
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.pending()).toBeNull();
  });

  it("past the TTL: answers with the kept value at once and refreshes once in the background", async () => {
    let value = LIVE;
    let release!: () => void;
    const load = vi.fn(async () => value);
    const { cache } = setup(load);
    await cache.get();

    value = ON;
    load.mockImplementationOnce(() => new Promise((r) => (release = () => r(value))));
    vi.advanceTimersByTime(TTL);
    // The refresh is still out, yet the answer is immediate and stale.
    expect(await cache.get()).toEqual(LIVE);
    expect(await cache.get()).toEqual(LIVE);
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.pending()).not.toBeNull();

    release();
    await cache.pending();
    expect(cache.pending()).toBeNull();
    expect(await cache.get()).toEqual(ON);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("a load that fails reads as live (fail open), is logged, and is retried after the TTL rather than on every request", async () => {
    const load = vi.fn(async (): Promise<{ on: boolean }> => {
      throw new Error("redis down");
    });
    const { cache, onError } = setup(load);
    expect(await cache.get()).toEqual(LIVE);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(await cache.get()).toEqual(LIVE);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(TTL);
    await cache.get();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("a load that throws synchronously also reads as live", async () => {
    const { cache, onError } = setup(() => {
      throw new Error("no url");
    });
    expect(await cache.get()).toEqual(LIVE);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("a load that hangs past the timeout reads as live, so a cold request never waits longer than the timeout", async () => {
    const load = vi.fn(() => new Promise<{ on: boolean }>(() => undefined));
    const { cache, onError } = setup(load);
    const answer = cache.get();
    vi.advanceTimersByTime(TIMEOUT);
    expect(await answer).toEqual(LIVE);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("an error after a known value keeps it (stale-if-error) and tries again after the next TTL", async () => {
    const load = vi.fn(async () => ON);
    const { cache, onError } = setup(load);
    expect(await cache.get()).toEqual(ON);
    load.mockRejectedValueOnce(new Error("redis down"));
    vi.advanceTimersByTime(TTL);
    await cache.get();
    await cache.pending();
    // A deliberate "on" survives a Redis outage: it is never turned into live.
    expect(await cache.get()).toEqual(ON);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(2);
    // Re-armed for a TTL, not retried on every request.
    await cache.get();
    expect(load).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(TTL);
    await cache.get();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("a load that hangs while on keeps on, so a slow Redis cannot open a closed app", async () => {
    const load = vi.fn(async () => ON);
    const cache = swrValue({ load, fallback: LIVE, ttlMs: TTL, timeoutMs: TIMEOUT, awaitWhenStale: (v) => v.on });
    await cache.get();
    load.mockImplementationOnce(() => new Promise(() => undefined));
    vi.advanceTimersByTime(TTL);
    const answer = cache.get();
    vi.advanceTimersByTime(TIMEOUT);
    expect(await answer).toEqual(ON);
  });

  it("set() takes effect at once, and a load already out when it was called cannot overwrite it", async () => {
    let release!: () => void;
    const load = vi.fn(async () => LIVE);
    const { cache } = setup(load);
    await cache.get();
    load.mockImplementationOnce(() => new Promise((r) => (release = () => r(LIVE))));
    vi.advanceTimersByTime(TTL);
    await cache.get();
    cache.set(ON);
    release();
    await cache.pending();
    expect(await cache.get()).toEqual(ON);
  });

  it("awaitWhenStale: a stale value it names is not served, the caller waits for the fresh one", async () => {
    let value = ON;
    const load = vi.fn(async () => value);
    const cache = swrValue({ load, fallback: LIVE, ttlMs: TTL, timeoutMs: TIMEOUT, awaitWhenStale: (v) => v.on });
    expect(await cache.get()).toEqual(ON);
    value = LIVE;
    // Within the TTL the kept value stands, with no load.
    vi.advanceTimersByTime(TTL - 1);
    expect(await cache.get()).toEqual(ON);
    expect(load).toHaveBeenCalledTimes(1);
    // Past it, "on" is not served stale: this caller gets the fresh "live".
    vi.advanceTimersByTime(1);
    expect(await cache.get()).toEqual(LIVE);
    expect(load).toHaveBeenCalledTimes(2);
    // "Live" is served stale as usual: no wait.
    value = ON;
    vi.advanceTimersByTime(TTL);
    expect(await cache.get()).toEqual(LIVE);
    await cache.pending();
    expect(await cache.get()).toEqual(ON);
  });
});
