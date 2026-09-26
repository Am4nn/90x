import { describe, expect, it } from "vitest";
import { key, SCHEDULE_PREFIX, scheduleId } from "./keys";

describe("upstash naming (shared with Curfew)", () => {
  it("prefixes every Redis key with 90x:", () => {
    expect(key("lcsync", "user-1")).toBe("90x:lcsync:user-1");
  });
  it("names every QStash schedule 90x-…", () => {
    expect(scheduleId("leetcode-sync")).toBe("90x-leetcode-sync");
    expect(SCHEDULE_PREFIX).toBe("90x-");
  });
});
