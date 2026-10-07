import { describe, expect, it } from "vitest";
import { type HourlyResult, judgeHourly, judgeLeetcode, judgeWeekly, type LeetcodeResult, summarize, tally } from "./outcomes";

const hourly = (over: Partial<HourlyResult> = {}): HourlyResult => ({ users: 41, due: 2, ok: { morning: 2 }, failed: {}, ...over });
const leetcode = (over: Partial<LeetcodeResult> = {}): LeetcodeResult => ({
  users: 5,
  ok: 5,
  new: 3,
  failed: 0,
  skipped: 0,
  disabled: 0,
  unknown: 0,
  errors: [],
  ...over,
});

describe("judges", () => {
  it("hourly: ok when everything due ran, skipped when nothing was due, failed when any kind failed", () => {
    expect(judgeHourly(hourly()).status).toBe("ok");
    expect(judgeHourly(hourly({ due: 0, ok: {} })).status).toBe("skipped");
    expect(judgeHourly(hourly({ due: 0, ok: {}, sweep: "ok" })).status).toBe("ok");
    expect(judgeHourly(hourly({ ok: { rollover: 1 }, failed: { rollover: 1 } }))).toMatchObject({
      status: "failed",
      error: "1 of 2 due failed (rollover)",
    });
    expect(judgeHourly(hourly({ due: 0, ok: {}, sweep: "failed" }))).toMatchObject({
      status: "failed",
      error: "0 of 0 due failed (stale sweep)",
    });
  });

  it("weekly: failed names how many of how many", () => {
    expect(judgeWeekly({ written: 17, already_done: 3, failed: 0 }).status).toBe("ok");
    expect(judgeWeekly({ written: 1, already_done: 0, failed: 1 })).toMatchObject({
      status: "failed",
      error: "1 of 2 weekly reviews failed",
    });
  });

  it("leetcode: failed carries the reasons, skipped when nobody synced", () => {
    expect(judgeLeetcode(leetcode()).status).toBe("ok");
    expect(judgeLeetcode(leetcode({ ok: 0, skipped: 5 })).status).toBe("skipped");
    expect(judgeLeetcode(leetcode({ ok: 2, failed: 3, errors: ["429 Too Many Requests"] }))).toMatchObject({
      status: "failed",
      error: "3 of 5 users failed: 429 Too Many Requests",
    });
  });

  it("tally counts by key", () => {
    const c: Record<string, number> = {};
    tally(c, "morning");
    tally(c, "morning");
    tally(c, "evening");
    expect(c).toEqual({ morning: 2, evening: 1 });
  });
});

describe("summarize", () => {
  it("says what the hourly tick did in words", () => {
    expect(summarize("hourly", "ok", hourly(), null)).toBe("41 readers checked, 2 due: 2 morning plans");
    expect(summarize("hourly", "skipped", hourly({ due: 0, ok: {} }), null)).toBe("41 readers checked, nothing due");
    expect(summarize("hourly", "failed", hourly({ users: 1, ok: { rollover: 1 }, failed: { rollover: 1 } }), "x")).toBe(
      "1 reader checked, 2 due: 1 day rollover, 1 rollover failed",
    );
  });

  it("covers the sweep, weekly reviews, LeetCode and the backup", () => {
    expect(summarize("stale-sweep", "ok", { hidden: 0 }, null)).toBe("Hid 0 cards (none skipped by everyone for 14 days)");
    expect(summarize("stale-sweep", "ok", { hidden: 1 }, null)).toBe("Hid 1 card");
    expect(summarize("weekly-reviews", "ok", { written: 17, already_done: 3, failed: 0 }, null)).toBe("Wrote 17 reviews, 3 already done");
    expect(summarize("leetcode-sync", "ok", leetcode({ ok: 4, new: 1 }), null)).toBe("Synced 4 of 5 users, 1 new check-in");
    expect(summarize("leetcode-sync", "failed", leetcode({ failed: 3 }), "3 of 5 users failed: 429")).toBe("3 of 5 users failed: 429");
    expect(summarize("leetcode-sync", "skipped", leetcode({ users: 0, ok: 0 }), null)).toBe("Nobody has a LeetCode name to sync");
    expect(summarize("leetcode-sync", "skipped", leetcode({ ok: 0, skipped: 3, unknown: 2 }), null)).toBe(
      "Nothing synced: 2 LeetCode names not found, 3 users waiting or turned off",
    );
    expect(summarize("leetcode-sync", "skipped", leetcode({ users: 1, ok: 0, unknown: 1 }), null)).toBe(
      "Nothing synced: 1 LeetCode name not found",
    );
    expect(summarize("leetcode-sync", "ok", leetcode({ ok: 4, new: 0, unknown: 1 }), null)).toBe(
      "Synced 4 of 5 users, 0 new check-ins; 1 LeetCode name not found",
    );
    expect(judgeLeetcode(leetcode({ ok: 0, unknown: 5 })).status).toBe("skipped");
    expect(summarize("db-backup", "ok", { bytes: 3_248_112, key: "90x/x.gpg" }, null)).toBe("Backup 3.1 MB encrypted and uploaded");
    expect(summarize("db-backup", "failed", {}, "step Dump and encrypt failed")).toBe("step Dump and encrypt failed");
  });

  it("copes with a run that threw, is still running, or kept a capped result", () => {
    expect(summarize("hourly", "failed", {}, "deadlock detected")).toBe("deadlock detected");
    expect(summarize("hourly", "running", {}, null)).toBe("Running now");
    expect(summarize("leetcode-sync", "ok", { truncated: true, chars: 12000, preview: "{" }, null)).toBe(
      "Result too big to keep (12,000 characters)",
    );
    expect(summarize("something-new", "ok", "a string", null)).toBe("Done");
    expect(summarize("hourly", "ok", { users: "x", due: null }, null)).toBe("0 readers checked, nothing due");
  });
});
