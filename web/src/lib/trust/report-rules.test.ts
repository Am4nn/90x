import { describe, expect, it } from "vitest";
import { cleanPath, DOING_MAX, MESSAGE_MAX, parseReport } from "./report-rules";

describe("cleanPath", () => {
  it("keeps an in-app path", () => {
    expect(cleanPath("/feed")).toBe("/feed");
    expect(cleanPath("/library?tab=dsa")).toBe("/library?tab=dsa");
  });

  it("drops anything that is not a plain in-app path", () => {
    for (const bad of ["https://evil.test", "//evil.test", "feed", "/a b", "/a\\b", "", null, 5, `/${"x".repeat(400)}`]) {
      expect(cleanPath(bad)).toBe("/me/report");
    }
  });
});

describe("parseReport", () => {
  it("trims and accepts a message", () => {
    expect(parseReport({ message: "  It froze  ", doing: "  ", from: "/feed" })).toEqual({
      report: { message: "It froze", doing: null, path: "/feed" },
    });
  });

  it("needs a message", () => {
    expect(parseReport({ message: "   ", doing: "", from: "/" })).toEqual({ error: "Tell us what happened." });
    expect(parseReport({ message: null, doing: "", from: "/" })).toHaveProperty("error");
  });

  it("refuses a message or an activity that is too long", () => {
    expect(parseReport({ message: "x".repeat(MESSAGE_MAX + 1), doing: "", from: "/" })).toHaveProperty("error");
    expect(parseReport({ message: "x", doing: "y".repeat(DOING_MAX + 1), from: "/" })).toHaveProperty("error");
    expect(parseReport({ message: "x".repeat(MESSAGE_MAX), doing: "y".repeat(DOING_MAX), from: "/" })).toHaveProperty("report");
  });
});
