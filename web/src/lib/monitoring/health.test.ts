import { describe, expect, it, vi } from "vitest";
import { deployVersion, healthResponse, passes, sharedFor } from "./health";

const version = { commit: "750b858", branch: "main", region: "bom1" };

describe("healthResponse", () => {
  it("is 200 ok with every check up and the deploy's version", () => {
    expect(healthResponse({ database: true, redis: true }, version)).toEqual({
      status: 200,
      body: { ok: true, checks: { database: "up", redis: "up" }, maintenance: false, version },
    });
  });
  it("says whether maintenance mode is on, and stays 200: the app is up, just closed", () => {
    expect(healthResponse({ database: true, redis: true }, version, true)).toEqual({
      status: 200,
      body: { ok: true, checks: { database: "up", redis: "up" }, maintenance: true, version },
    });
  });
  it("is 503 and shows which check is down, still with the version", () => {
    expect(healthResponse({ database: true, redis: false }, version)).toEqual({
      status: 503,
      body: { ok: false, checks: { database: "up", redis: "down" }, maintenance: false, version },
    });
    expect(healthResponse({ database: false, redis: false }, version).body.checks).toEqual({ database: "down", redis: "down" });
  });
});

describe("deployVersion", () => {
  it("reads the short commit, branch and region Vercel sets", () => {
    expect(
      deployVersion({ VERCEL_GIT_COMMIT_SHA: "750b858a1b2c3d4e5f", VERCEL_GIT_COMMIT_REF: "main", VERCEL_REGION: "bom1", SECRET: "x" }),
    ).toEqual(version);
  });
  it("is all null outside Vercel", () => {
    expect(deployVersion({})).toEqual({ commit: null, branch: null, region: null });
  });
});

describe("passes", () => {
  it("is true when the check resolves", async () => {
    expect(await passes(() => Promise.resolve(1), 50)).toBe(true);
  });
  it("is false when it throws", async () => {
    expect(await passes(() => Promise.reject(new Error("x")), 50)).toBe(false);
  });
  it("is false when it hangs past the deadline", async () => {
    expect(await passes(() => new Promise(() => {}), 20)).toBe(false);
  });
});

function sharedSetup() {
  let t = 0;
  let n = 0;
  const gates: (() => void)[] = [];
  const check = vi.fn(
    () =>
      new Promise<number>((resolve) => {
        const run = ++n;
        gates.push(() => resolve(run));
      }),
  );
  const get = sharedFor(15_000, check, () => t);
  return { get, check, finish: () => gates.shift()?.(), at: (ms: number) => (t = ms) };
}

describe("sharedFor", () => {
  it("shares one in-flight check across a burst", async () => {
    const { get, check, finish } = sharedSetup();
    const burst = Array.from({ length: 50 }, () => get());
    expect(check).toHaveBeenCalledTimes(1);
    finish();
    expect(await Promise.all(burst)).toEqual(Array(50).fill(1));
  });

  it("answers from the last result inside the window and checks again after it", async () => {
    const { get, check, finish, at } = sharedSetup();
    const first = get();
    finish();
    await first;
    at(14_999);
    expect(await get()).toBe(1);
    expect(check).toHaveBeenCalledTimes(1);
    at(15_000);
    const second = get();
    expect(check).toHaveBeenCalledTimes(2);
    finish();
    expect(await second).toBe(2);
  });

  it("starts the window when the check finishes, not when it started", async () => {
    const { get, check, finish, at } = sharedSetup();
    const first = get();
    at(3_000);
    finish();
    await first;
    at(17_999);
    expect(await get()).toBe(1);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("does not keep a check that threw: the next call checks again", async () => {
    const check = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok");
    const get = sharedFor(15_000, check, () => 0);
    await expect(get()).rejects.toThrow("boom");
    expect(await get()).toBe("ok");
    expect(check).toHaveBeenCalledTimes(2);
  });
});
