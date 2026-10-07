import { describe, expect, it } from "vitest";
import { nextRun, parseCron, previousRun } from "./cron";

const at = (iso: string) => new Date(iso);

describe("nextRun", () => {
  it("finds the next minute 5 of an hour, strictly after the given time", () => {
    expect(nextRun("5 * * * *", at("2026-10-08T14:03:00Z")).toISOString()).toBe("2026-10-08T14:05:00.000Z");
    expect(nextRun("5 * * * *", at("2026-10-08T14:05:00Z")).toISOString()).toBe("2026-10-08T15:05:00.000Z");
    expect(nextRun("5 * * * *", at("2026-10-08T14:05:30Z")).toISOString()).toBe("2026-10-08T15:05:00.000Z");
  });

  it("steps over hours, days and the year end", () => {
    expect(nextRun("0 */6 * * *", at("2026-10-08T06:00:00Z")).toISOString()).toBe("2026-10-08T12:00:00.000Z");
    expect(nextRun("30 21 * * *", at("2026-12-31T22:00:00Z")).toISOString()).toBe("2027-01-01T21:30:00.000Z");
    expect(nextRun("5 0 * * *", at("2026-10-08T00:06:00Z")).toISOString()).toBe("2026-10-09T00:05:00.000Z");
  });

  it("reads lists, ranges, steps and weekdays (7 is Sunday too)", () => {
    expect(nextRun("0 9 * * 1-5", at("2026-10-09T10:00:00Z")).toISOString()).toBe("2026-10-12T09:00:00.000Z"); // Fri -> Mon
    expect(nextRun("0 18 * * 7", at("2026-10-08T00:00:00Z")).toISOString()).toBe("2026-10-11T18:00:00.000Z");
    expect(nextRun("15,45 * * * *", at("2026-10-08T10:20:00Z")).toISOString()).toBe("2026-10-08T10:45:00.000Z");
    expect(nextRun("0 0 1 */3 *", at("2026-10-08T00:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("matches either day field when both are restricted, as cron does", () => {
    // The 13th or any Friday: Fri 9 Oct comes first.
    expect(nextRun("0 0 13 * 5", at("2026-10-08T00:00:00Z")).toISOString()).toBe("2026-10-09T00:00:00.000Z");
  });
});

describe("previousRun", () => {
  it("finds the last matching minute at or before the given time", () => {
    expect(previousRun("5 * * * *", at("2026-10-08T14:05:00Z")).toISOString()).toBe("2026-10-08T14:05:00.000Z");
    expect(previousRun("5 * * * *", at("2026-10-08T14:04:59Z")).toISOString()).toBe("2026-10-08T13:05:00.000Z");
    expect(previousRun("30 21 * * *", at("2026-01-01T03:00:00Z")).toISOString()).toBe("2025-12-31T21:30:00.000Z");
    expect(previousRun("0 */6 * * *", at("2026-10-08T05:59:00Z")).toISOString()).toBe("2026-10-08T00:00:00.000Z");
  });
});

describe("parseCron", () => {
  it("refuses what it cannot read", () => {
    for (const bad of ["", "* * * *", "60 * * * *", "* 24 * * *", "*/0 * * * *", "a * * * *", "5-1 * * * *"]) {
      expect(() => parseCron(bad), bad).toThrow();
    }
  });
});
