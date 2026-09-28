import { describe, expect, it } from "vitest";
import { addDays, daysBetween, localDate, localHour, startOfLocalDay, weekday } from "./dates";

describe("localDate", () => {
  it("crosses midnight at the user's midnight, not UTC's", () => {
    // Asia/Kolkata is UTC+5:30: midnight there is 18:30Z the day before.
    expect(localDate("Asia/Kolkata", new Date("2026-09-27T18:29:00Z"))).toBe("2026-09-27");
    expect(localDate("Asia/Kolkata", new Date("2026-09-27T18:31:00Z"))).toBe("2026-09-28");
  });

  it("handles negative offsets", () => {
    expect(localDate("America/Los_Angeles", new Date("2026-09-28T06:59:00Z"))).toBe("2026-09-27");
    expect(localDate("America/Los_Angeles", new Date("2026-09-28T07:01:00Z"))).toBe("2026-09-28");
  });

  it("follows daylight saving", () => {
    // LA switches to PST on 2026-11-01; midnight is then 08:00Z.
    expect(localDate("America/Los_Angeles", new Date("2026-11-02T07:30:00Z"))).toBe("2026-11-01");
    expect(localDate("America/Los_Angeles", new Date("2026-11-02T08:30:00Z"))).toBe("2026-11-02");
  });
});

describe("date math", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-09-01", "2026-09-27")).toBe(26);
    expect(daysBetween("2026-09-27", "2026-09-01")).toBe(-26);
  });

  it("gives the weekday, Sunday = 0", () => {
    expect(weekday("2026-09-27")).toBe(0);
    expect(weekday("2026-09-28")).toBe(1);
  });

  it("gives the local hour", () => {
    expect(localHour("Asia/Kolkata", new Date("2026-09-27T14:30:00Z"))).toBe(20);
    expect(localHour("Asia/Kolkata", new Date("2026-09-27T18:30:00Z"))).toBe(0);
  });
});

describe("startOfLocalDay", () => {
  it("is the instant the local day begins, not UTC midnight", () => {
    // Kolkata is UTC+5:30, so 2026-09-28 begins at 18:30Z on the 27th.
    expect(startOfLocalDay("Asia/Kolkata", "2026-09-28")).toBe("2026-09-27T18:30:00.000Z");
    // Querying from UTC midnight instead skipped the user's first 5.5 hours, so
    // the weekly review read six days and 18.5 hours of the week it covered.
    expect(startOfLocalDay("UTC", "2026-09-28")).toBe("2026-09-28T00:00:00.000Z");
  });

  it("handles zones behind UTC", () => {
    // Los Angeles in September is UTC-7, so the day begins at 07:00Z.
    expect(startOfLocalDay("America/Los_Angeles", "2026-09-28")).toBe("2026-09-28T07:00:00.000Z");
  });

  it("handles a half-hour zone across a DST change", () => {
    // Lord Howe shifts by 30 minutes; the first Sunday in October 2026 is the 4th.
    const before = startOfLocalDay("Australia/Lord_Howe", "2026-10-03");
    const after = startOfLocalDay("Australia/Lord_Howe", "2026-10-05");
    expect(new Date(after).getTime() - new Date(before).getTime()).toBe(2 * 86_400_000 - 30 * 60_000);
  });
});
