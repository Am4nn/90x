import { describe, expect, it } from "vitest";
import { parseLeetcodeUsername } from "./username";

describe("parseLeetcodeUsername", () => {
  it("takes a bare username, trimmed", () => {
    expect(parseLeetcodeUsername("  am4nn ")).toBe("am4nn");
    expect(parseLeetcodeUsername("@am4nn")).toBe("am4nn");
    expect(parseLeetcodeUsername("a.b_c-d")).toBe("a.b_c-d");
  });

  it("takes the name out of a pasted profile link", () => {
    expect(parseLeetcodeUsername("https://leetcode.com/u/am4nn/")).toBe("am4nn");
    expect(parseLeetcodeUsername("leetcode.com/am4nn")).toBe("am4nn");
    expect(parseLeetcodeUsername("https://www.leetcode.com/u/am4nn?tab=solved")).toBe("am4nn");
  });

  it("refuses what can't be a username", () => {
    expect(parseLeetcodeUsername("")).toBeNull();
    expect(parseLeetcodeUsername("two words")).toBeNull();
    expect(parseLeetcodeUsername("https://leetcode.com/problems/two-sum/")).toBeNull();
    expect(parseLeetcodeUsername("x".repeat(41))).toBeNull();
  });
});
