// A value kept in this server instance's memory and refreshed in the background, so the proxy can
// ask "is maintenance on?" on every request without a network call (stale-while-revalidate).
//
//   - warm, within the TTL: the kept value, no load;
//   - warm, past the TTL: the kept value at once, and one load in the background to replace it, unless
//     `awaitWhenStale` says this value is not worth serving stale (then the caller waits, as when cold);
//   - cold (nothing kept yet): the first caller waits for one load, and callers meanwhile share it;
//   - a load that fails or outlasts the timeout keeps the last known value (stale-if-error) for another TTL;
//     only a cold instance, with nothing known, takes the fallback (fail open).
//
// Pure apart from the injected loader and clock, so the timing is tested with fake timers.

export type SwrOptions<T> = {
  load: () => Promise<T>;
  /** What a failed or timed-out load counts as when nothing was ever loaded. */
  fallback: T;
  ttlMs: number;
  timeoutMs: number;
  now?: () => number;
  onError?: (error: unknown) => void;
  /** A value past its TTL that must not be served stale: the caller waits for the fresh one instead. */
  awaitWhenStale?: (value: T) => boolean;
};

export type SwrValue<T> = {
  /** The current value: never waits on a load once one has finished. */
  get(): Promise<T>;
  /** The background load in flight, if any, for a caller that can keep the instance alive for it (waitUntil). */
  pending(): Promise<unknown> | null;
  /** Replaces the kept value now, as after a save on this instance. */
  set(value: T): void;
};

export function swrValue<T>({ load, fallback, ttlMs, timeoutMs, now = Date.now, onError, awaitWhenStale }: SwrOptions<T>): SwrValue<T> {
  let kept: { value: T; at: number } | null = null;
  let inflight: Promise<T> | null = null;
  // Bumped by set(): a load that started before it must not overwrite the newer value when it lands.
  let generation = 0;

  function refresh(): Promise<T> {
    if (inflight) return inflight;
    const started = generation;
    // The executor runs load() now; a synchronous throw becomes a rejection like any other failure.
    inflight = withTimeout(new Promise<T>((resolve) => resolve(load())), timeoutMs)
      .catch((error: unknown) => {
        onError?.(error);
        // Keep what was last known: an outage must never invent "live" for an app an admin closed, nor "on" for an open one.
        return kept ? kept.value : fallback;
      })
      .then((value) => {
        inflight = null;
        if (started !== generation && kept) return kept.value;
        kept = { value, at: now() };
        return value;
      });
    return inflight;
  }

  return {
    get() {
      if (!kept) return refresh();
      if (now() - kept.at >= ttlMs) {
        const fresh = refresh();
        if (awaitWhenStale?.(kept.value)) return fresh;
      }
      return Promise.resolve(kept.value);
    },
    pending: () => inflight,
    set(value) {
      generation++;
      kept = { value, at: now() };
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
