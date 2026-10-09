import { describe, expect, it } from "vitest";
import { isTimeZone, timeZones, zoneLabel, zoneOffset } from "./zones";

describe("timeZones", () => {
  it("lists the runtime's zones, sorted, with UTC", () => {
    const zones = timeZones();
    // Node, like Chrome, lists India under its older name; Postgres accepts both.
    expect(zones.some((z) => z === "Asia/Kolkata" || z === "Asia/Calcutta")).toBe(true);
    expect(zones).toContain("UTC");
    expect(zones).toEqual(zones.toSorted((a, b) => a.localeCompare(b)));
  });

  it("keeps a saved zone the list doesn't have", () => {
    expect(timeZones("Asia/Kolkata")).toContain("Asia/Kolkata");
    expect(timeZones("Asia/Calcutta")).toContain("Asia/Calcutta");
  });
});

describe("zoneLabel", () => {
  const winter = new Date("2026-01-15T12:00:00Z");
  it("names the zone with its offset", () => {
    expect(zoneLabel("Asia/Kolkata", winter)).toBe("Asia/Kolkata · GMT+5:30");
    expect(zoneLabel("America/New_York", winter)).toBe("America/New York · GMT-5");
    expect(zoneOffset("UTC", winter)).toBe("GMT");
  });
});

describe("isTimeZone", () => {
  it("accepts IANA names and refuses anything else", () => {
    expect(isTimeZone("Europe/London")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("")).toBe(false);
  });
});
