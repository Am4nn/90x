import { describe, expect, it } from "vitest";
import { accountRedisKeys, confirmsDeletion } from "./account-rules";

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
