import { describe, expect, it } from "vitest";
import { healthResponse, passes } from "./health";

describe("healthResponse", () => {
  it("is 200 ok when both pass", () => {
    expect(healthResponse({ database: true, redis: true })).toEqual({ status: 200, body: { ok: true } });
  });
  it("is 503 and names only the failed dependency", () => {
    expect(healthResponse({ database: true, redis: false })).toEqual({ status: 503, body: { ok: false, failed: ["redis"] } });
    expect(healthResponse({ database: false, redis: false }).body.failed).toEqual(["database", "redis"]);
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
