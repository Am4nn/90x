import { describe, expect, it } from "vitest";
import { shouldSync } from "./backoff";
import { mergeSubmissions } from "./merge";

describe("mergeSubmissions", () => {
  it("uses real ids for accepted solves and stable synthetic ids for the rest", () => {
    const recent = [
      { title: "LRU Cache", titleSlug: "lru-cache", timestamp: "100", statusDisplay: "Wrong Answer", lang: "java" },
      { title: "LRU Cache", titleSlug: "lru-cache", timestamp: "200", statusDisplay: "Accepted", lang: "java" },
    ];
    const accepted = [{ id: "987", title: "LRU Cache", titleSlug: "lru-cache", timestamp: "200", lang: "java" }];
    const merged = mergeSubmissions(recent, accepted);
    expect(merged.map((s) => s.id)).toEqual(["lru-cache:100", "987"]);
    expect(merged[1]).toMatchObject({ slug: "lru-cache", status: "Accepted", timestamp: 200 });
  });

  it("keeps accepted solves that fell out of the mixed list", () => {
    const merged = mergeSubmissions([], [{ id: "5", title: "A", titleSlug: "a", timestamp: "50", lang: "python3" }]);
    expect(merged).toEqual([{ id: "5", slug: "a", title: "A", timestamp: 50, status: "Accepted", lang: "python3" }]);
  });
});

describe("shouldSync", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  it("syncs healthy integrations", () => {
    expect(shouldSync({ enabled: true, consecutiveFailures: 0, lastAttemptAt: null }, now)).toBe(true);
  });
  it("backs off to once a day after 3 failures in a row", () => {
    const hourAgo = new Date("2026-09-27T11:00:00Z");
    const dayAgo = new Date("2026-09-26T11:00:00Z");
    expect(shouldSync({ enabled: true, consecutiveFailures: 3, lastAttemptAt: hourAgo }, now)).toBe(false);
    expect(shouldSync({ enabled: true, consecutiveFailures: 3, lastAttemptAt: dayAgo }, now)).toBe(true);
  });
  it("never syncs a disabled integration", () => {
    expect(shouldSync({ enabled: false, consecutiveFailures: 0, lastAttemptAt: null }, now)).toBe(false);
  });
});
