import { describe, expect, it } from "vitest";
import { deployVersion, healthResponse, passes } from "./health";

const version = { commit: "750b858", branch: "main", region: "bom1" };

describe("healthResponse", () => {
  it("is 200 ok with every check up and the deploy's version", () => {
    expect(healthResponse({ database: true, redis: true }, version)).toEqual({
      status: 200,
      body: { ok: true, checks: { database: "up", redis: "up" }, version },
    });
  });
  it("is 503 and shows which check is down, still with the version", () => {
    expect(healthResponse({ database: true, redis: false }, version)).toEqual({
      status: 503,
      body: { ok: false, checks: { database: "up", redis: "down" }, version },
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
