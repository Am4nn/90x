import { describe, expect, it } from "vitest";
import { dueJobs, eveningText, morningText } from "./notify";

const user = (over: Partial<Parameters<typeof dueJobs>[0][number]> = {}) => ({
  userId: "u",
  timezone: "Asia/Kolkata",
  morningHour: 8 as number | null,
  evening: true,
  ...over,
});

describe("dueJobs", () => {
  it("rolls the day over at local midnight", () => {
    // 18:30Z is 00:00 in Kolkata.
    expect(dueJobs([user()], new Date("2026-09-27T18:30:00Z"))).toEqual([{ userId: "u", kind: "rollover" }]);
  });

  it("sends the morning plan at the chosen hour, and nothing when it's off", () => {
    const at8 = new Date("2026-09-27T02:30:00Z"); // 08:00 Kolkata
    expect(dueJobs([user()], at8)).toEqual([{ userId: "u", kind: "morning" }]);
    expect(dueJobs([user({ morningHour: null })], at8)).toEqual([]);
  });

  it("sends the evening reminder at 8 pm local unless switched off", () => {
    const at20 = new Date("2026-09-27T14:30:00Z"); // 20:00 Kolkata
    expect(dueJobs([user()], at20)).toEqual([{ userId: "u", kind: "evening" }]);
    expect(dueJobs([user({ evening: false })], at20)).toEqual([]);
  });

  it("uses each user's own time zone", () => {
    const la = user({ userId: "la", timezone: "America/Los_Angeles" });
    // 03:00Z is 20:00 in Los Angeles and 08:30 in Kolkata.
    expect(dueJobs([user({ morningHour: 9 }), la], new Date("2026-09-27T03:00:00Z"))).toEqual([{ userId: "la", kind: "evening" }]);
  });
});

describe("dueJobs weekly review", () => {
  // 2026-09-27 is a Sunday.
  it("writes the review at 18:00 local on Sunday", () => {
    const at18 = new Date("2026-09-27T12:30:00Z"); // 18:00 Kolkata
    expect(dueJobs([user()], at18)).toEqual([{ userId: "u", kind: "weekly" }]);
  });

  it("skips 18:00 on other days and other hours on Sunday", () => {
    expect(dueJobs([user()], new Date("2026-09-26T12:30:00Z"))).toEqual([]); // Saturday 18:00
    expect(dueJobs([user()], new Date("2026-09-27T11:30:00Z"))).toEqual([]); // Sunday 17:00
  });

  it("uses the local weekday, not the UTC one", () => {
    // 2026-09-28T01:00Z is Monday in UTC but Sunday 18:00 in Los Angeles.
    const la = user({ userId: "la", timezone: "America/Los_Angeles", morningHour: null });
    expect(dueJobs([la], new Date("2026-09-28T01:00:00Z"))).toEqual([{ userId: "la", kind: "weekly" }]);
    // 05:00Z on Sunday is 18:00 Sunday in Auckland, while UTC is still in the morning.
    const auckland = user({ userId: "nz", timezone: "Pacific/Auckland", morningHour: null, evening: false });
    expect(dueJobs([auckland], new Date("2026-09-27T05:00:00Z"))).toEqual([{ userId: "nz", kind: "weekly" }]);
    expect(dueJobs([auckland], new Date("2026-09-26T05:00:00Z"))).toEqual([]);
  });
});

describe("notification text", () => {
  it("says how much is planned", () => {
    expect(morningText(4, 150)).toEqual({ title: "Today: 4 missions", body: "About 2h 30m. Start with the first one." });
  });

  it("says how much is left in the evening", () => {
    expect(eveningText(2, 3)).toEqual({ title: "2 missions left today", body: "Finish them to keep your 3-day streak." });
    expect(eveningText(1, 0).title).toBe("1 mission left today");
    expect(eveningText(1, 0).body).toBe("Finish it to cross today off.");
  });
});
