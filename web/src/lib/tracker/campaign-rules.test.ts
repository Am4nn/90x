import { describe, expect, it } from "vitest";
import { carriedFocus, cleanCompanies, focusRange, lengthError, parseFocus } from "./campaign-rules";

describe("lengthError", () => {
  it("allows any length that still includes today", () => {
    expect(lengthError("2026-09-01", "2026-09-27", 30)).toBeNull(); // day 27 of 30
    expect(lengthError("2026-09-01", "2026-09-27", 27)).toBeNull();
  });

  it("refuses to end the campaign before today", () => {
    expect(lengthError("2026-09-01", "2026-09-27", 26)).toMatch(/at least 27/);
  });

  it("keeps lengths in range", () => {
    expect(lengthError("2026-09-27", "2026-09-27", 6)).toMatch(/7/);
    expect(lengthError("2026-09-27", "2026-09-27", 366)).toMatch(/365/);
  });
});

describe("focusRange", () => {
  it("runs from today for whole weeks", () => {
    expect(focusRange("2026-09-27", 1)).toEqual({ from: "2026-09-27", to: "2026-10-03" });
    expect(focusRange("2026-09-27", 2)).toEqual({ from: "2026-09-27", to: "2026-10-10" });
  });
});

describe("parseFocus", () => {
  it("reads the new shape", () => {
    expect(parseFocus({ companies: ["Google", "Amazon"], from: "2026-10-01", to: "2026-10-28" })).toEqual({
      companies: ["Google", "Amazon"],
      from: "2026-10-01",
      to: "2026-10-28",
    });
  });

  it("reads a row stored before multi-select as a list of one", () => {
    expect(parseFocus({ company: "Amazon", from: "2026-10-01", to: "2026-10-07" })).toEqual({
      companies: ["Amazon"],
      from: "2026-10-01",
      to: "2026-10-07",
    });
  });

  it("returns null for nothing, junk or an empty list", () => {
    expect(parseFocus(null)).toBeNull();
    expect(parseFocus({ company: "", from: "2026-10-01", to: "2026-10-07" })).toBeNull();
    expect(parseFocus({ companies: [], from: "2026-10-01", to: "2026-10-07" })).toBeNull();
    expect(parseFocus({ companies: ["Google"], from: "soon", to: "later" })).toBeNull();
    expect(parseFocus("Google")).toBeNull();
  });

  it("de-duplicates ignoring case and keeps at most ten", () => {
    const many = Array.from({ length: 14 }, (_, i) => `Co${i}`);
    const got = parseFocus({ companies: ["Google", "GOOGLE", ...many], from: "2026-10-01", to: "2026-10-07" });
    expect(got?.companies).toHaveLength(10);
    expect(got?.companies[0]).toBe("Google");
  });
});

describe("cleanCompanies", () => {
  it("trims, drops blanks and de-duplicates ignoring case, first pick wins", () => {
    expect(cleanCompanies(["  Uber ", "", "uber", "Lyft"])).toEqual(["Uber", "Lyft"]);
  });

  it("uses the catalog's casing for a known company", () => {
    expect(cleanCompanies(["google", "stripe"], ["Google", "Amazon"])).toEqual(["Google", "stripe"]);
  });

  it("cuts a name at 60 characters", () => {
    expect(cleanCompanies(["x".repeat(80)])[0]).toHaveLength(60);
  });

  it("does not cap the list, so a caller can refuse more than ten", () => {
    expect(cleanCompanies(Array.from({ length: 12 }, (_, i) => `Co${i}`))).toHaveLength(12);
  });
});

describe("carriedFocus", () => {
  const old = { companies: ["Google", "Uber"], from: "2026-10-01", to: "2026-10-14" };

  it("carries the companies into a fresh window of the same length", () => {
    expect(carriedFocus(old, "2026-10-05", "2026-10-05")).toEqual({ companies: ["Google", "Uber"], from: "2026-10-05", to: "2026-10-18" });
  });

  it("carries an old single-company row", () => {
    expect(carriedFocus({ company: "Amazon", from: "2026-10-01", to: "2026-10-07" }, "2026-10-03", "2026-10-03")).toEqual({
      companies: ["Amazon"],
      from: "2026-10-03",
      to: "2026-10-09",
    });
  });

  it("does not carry a window that already ended, or nothing", () => {
    expect(carriedFocus(old, "2026-10-15", "2026-10-15")).toBeNull();
    expect(carriedFocus(null, "2026-10-15", "2026-10-15")).toBeNull();
  });

  it("still carries on the last day of the window", () => {
    expect(carriedFocus(old, "2026-10-14", "2026-10-14")?.to).toBe("2026-10-27");
  });
});
