import { describe, expect, it } from "vitest";
import { isSafeNext, safeNext } from "./next-path";

const base = "https://90x.amanarya.com/auth/callback";

describe("isSafeNext", () => {
  it.each(["/", "/today", "/library/problem/two-sum", "/me?tab=plan#x", "/a%2F%5Cb"])("accepts the path %s", (next) => {
    expect(isSafeNext(next)).toBe(true);
    expect(new URL(next, base).host).toBe("90x.amanarya.com");
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["a backslash host", "/\\evil.com"],
    ["a backslash pair", "\\\\evil.com"],
    ["a tab the URL parser drops", "/\t/evil.com"],
    ["a newline the URL parser drops", "/\n/evil.com"],
    ["any other control character", "/today\u0000"],
    ["DEL", "/today\u007f"],
    ["an absolute URL", "https://evil.com"],
    ["a relative path", "today"],
    ["empty", ""],
    ["null", null],
    ["undefined", undefined],
  ])("refuses %s", (_, next) => expect(isSafeNext(next)).toBe(false));

  it("refuses every value the URL parser would send to another host", () => {
    for (const next of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\r\n/evil.com"]) {
      expect(new URL(next, base).host).not.toBe("90x.amanarya.com");
      expect(isSafeNext(next)).toBe(false);
    }
  });
});

describe("safeNext", () => {
  it("keeps a safe path and falls back otherwise", () => {
    expect(safeNext("/me")).toBe("/me");
    expect(safeNext("/\\evil.com")).toBe("/today");
    expect(safeNext(null, "/")).toBe("/");
  });
});
