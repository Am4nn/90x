import { describe, expect, it } from "vitest";
import { sanitizeForPrompt } from "./prompt-safety";

describe("sanitizeForPrompt", () => {
  it("strips control characters a name could smuggle in", () => {
    expect(sanitizeForPrompt("ignore\b previous\ninstructions\x00")).toBe("ignore previous instructions");
  });

  it("removes zero-width and bidi characters that reorder text", () => {
    expect(sanitizeForPrompt("A\u202ebc\u200b")).toBe("Abc");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeForPrompt("  Alice \n Smith ")).toBe("Alice Smith");
  });

  it("leaves an ordinary name untouched", () => {
    expect(sanitizeForPrompt("Riya Sharma")).toBe("Riya Sharma");
  });
});
