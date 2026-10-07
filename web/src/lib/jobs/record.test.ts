import { afterEach, describe, expect, it, vi } from "vitest";
import { capResult, type FinishedRun, MAX_RESULT_CHARS, recordRun, type RunStore } from "./record";

function memoryStore(fail: { start?: boolean; finish?: boolean } = {}) {
  const started: string[] = [];
  const finished: FinishedRun[] = [];
  const store: RunStore = {
    async start(job) {
      if (fail.start) throw new Error("db down");
      started.push(job);
      return 7;
    },
    async finish(run) {
      if (fail.finish) throw new Error("db down");
      finished.push(run);
    },
  };
  return { store, started, finished };
}

// A clock that moves 1.5 s between reads.
function ticking() {
  let t = Date.parse("2026-10-08T14:35:00Z");
  return () => {
    const d = new Date(t);
    t += 1500;
    return d;
  };
}

const boom = (message: string) => async () => {
  throw new Error(message);
};

afterEach(() => vi.restoreAllMocks());

describe("recordRun", () => {
  it("starts the job without waiting for the start write, and finishes the row it started", async () => {
    let release!: (id: number) => void;
    const order: string[] = [];
    const finished: FinishedRun[] = [];
    const store: RunStore = {
      start: () => new Promise<number>((resolve) => (release = resolve)),
      async finish(run) {
        order.push("finish");
        finished.push(run);
      },
    };
    const pending = recordRun(
      "hourly",
      async () => {
        order.push("run");
        release(9);
        return {};
      },
      { store, clock: ticking() },
    );
    await pending;
    expect(order).toEqual(["run", "finish"]);
    expect(finished[0]?.id).toBe(9);
  });

  it("records an ok run with its duration and result, and returns the job's value", async () => {
    const { store, started, finished } = memoryStore();
    const value = await recordRun("hourly", async () => ({ users: 41, due: 2 }), { store, clock: ticking() });
    expect(value).toEqual({ users: 41, due: 2 });
    expect(started).toEqual(["hourly"]);
    expect(finished).toEqual([
      {
        id: 7,
        job: "hourly",
        startedAt: new Date("2026-10-08T14:35:00Z"),
        finishedAt: new Date("2026-10-08T14:35:01.500Z"),
        status: "ok",
        durationMs: 1500,
        result: { users: 41, due: 2 },
        error: null,
      },
    ]);
  });

  it("lets the judge set the status, the kept result and the error", async () => {
    const { store, finished } = memoryStore();
    await recordRun("leetcode-sync", async () => ({ failed: 3 }), {
      store,
      judge: (r) => ({ status: "failed", result: { ...r, kept: true }, error: "429 Too Many Requests" }),
    });
    expect(finished[0]).toMatchObject({ status: "failed", result: { failed: 3, kept: true }, error: "429 Too Many Requests" });
  });

  it("records a throwing job as failed with its message, then rethrows", async () => {
    const { store, finished } = memoryStore();
    await expect(recordRun("hourly", boom("deadlock detected"), { store })).rejects.toThrow("deadlock detected");
    expect(finished[0]).toMatchObject({ status: "failed", error: "deadlock detected", result: {} });
  });

  it("never fails the job when the store throws, and logs instead", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { store } = memoryStore({ start: true, finish: true });
    await expect(recordRun("hourly", async () => "done", { store })).resolves.toBe("done");
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("still rethrows the job's own error when the store is down too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { store } = memoryStore({ start: true, finish: true });
    await expect(recordRun("hourly", boom("job broke"), { store })).rejects.toThrow("job broke");
  });

  it("still writes the whole row at the end when the start row failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const finished: FinishedRun[] = [];
    const store: RunStore = {
      start: () => Promise.reject(new Error("blip")),
      finish: async (run) => void finished.push(run),
    };
    await recordRun("stale-sweep", async () => ({ hidden: 0 }), { store });
    expect(finished[0]).toMatchObject({ id: null, job: "stale-sweep", status: "ok", result: { hidden: 0 } });
  });

  it("keeps the job's value even when its judge throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { store, finished } = memoryStore();
    const value = await recordRun("hourly", async () => 5, {
      store,
      judge: () => {
        throw new Error("bug");
      },
    });
    expect(value).toBe(5);
    expect(finished[0]?.status).toBe("ok");
  });

  it("caps a long error", async () => {
    const { store, finished } = memoryStore();
    await recordRun("hourly", boom("x".repeat(5000)), { store }).catch(() => {});
    expect(finished[0]?.error?.length).toBe(2000);
  });
});

describe("capResult", () => {
  it("keeps a small result as plain JSON", () => {
    expect(capResult({ at: new Date("2026-10-08T00:00:00Z"), n: 1 })).toEqual({ at: "2026-10-08T00:00:00.000Z", n: 1 });
    expect(capResult(undefined)).toEqual({});
    expect(capResult("stale cards hidden: 0")).toBe("stale cards hidden: 0");
  });

  it("swaps a big result for its size and a short preview", () => {
    const big = { results: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`user-${i}`, "ok (0 new)"])) };
    const capped = capResult(big) as { truncated: boolean; chars: number; preview: string };
    expect(capped.truncated).toBe(true);
    expect(capped.chars).toBe(JSON.stringify(big).length);
    expect(JSON.stringify(capped).length).toBeLessThan(MAX_RESULT_CHARS);
  });

  it("does not throw on a result that cannot be written as JSON", () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(capResult(loop)).toEqual({ unreadable: true });
  });
});
