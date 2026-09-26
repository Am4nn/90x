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
