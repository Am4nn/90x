import { describe, expect, it } from "vitest";
import { addDays, daysBetween, localDate, localHour, weekday } from "./dates";

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
