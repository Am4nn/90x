import { describe, expect, it } from "vitest";
import { accountRedisKeys, confirmsDeletion, confirmsEmail } from "./account-rules";

describe("confirmsDeletion", () => {
  it("takes the word typed in any case, with spaces around it", () => {
    expect(confirmsDeletion("DELETE")).toBe(true);
    expect(confirmsDeletion("  delete ")).toBe(true);
  });

  it("refuses anything else", () => {
    for (const typed of ["", "DEL", "delete my account", "DELETED", null, undefined, 1]) {
      expect(confirmsDeletion(typed)).toBe(false);
    }
  });
});

describe("confirmsEmail", () => {
  it("takes the account's email typed in any case, with spaces around it", () => {
    expect(confirmsEmail("ana@example.com", "ana@example.com")).toBe(true);
    expect(confirmsEmail("  Ana@Example.COM ", "ana@example.com")).toBe(true);
    expect(confirmsEmail("ana@example.com", "Ana@Example.com")).toBe(true);
  });

  it("refuses anything else, and an account with no email", () => {
    for (const typed of ["", "ana@example.co", "ana", "bob@example.com", "ana@example.com.", null, undefined, 1]) {
      expect(confirmsEmail(typed, "ana@example.com")).toBe(false);
    }
    expect(confirmsEmail("", "")).toBe(false);
    expect(confirmsEmail("ana@example.com", null)).toBe(false);
  });
});

describe("accountRedisKeys", () => {
  it("names only keys under the 90x prefix and this person", () => {
    const keys = accountRedisKeys("u-1");
    expect(keys.length).toBeGreaterThan(3);
    for (const k of keys) {
      expect(k.startsWith("90x:")).toBe(true);
      expect(k).toContain("u-1");
      expect(k).not.toContain("*");
    }
  });
});
