import { describe, expect, it } from "vitest";
import { hasControl } from "./control";

describe("hasControl", () => {
  it("catches line breaks, NUL, DEL, C1 controls and the Unicode line and paragraph separators", () => {
    for (const bad of ["a\r\nb", "a\nb", "a\u0000b", "a\u007fb", "a\u0085b", "a\u009fb", "a\u2028b", "a\u2029b"]) {
      expect(hasControl(bad)).toBe(true);
    }
  });

  it("lets ordinary text through, including accents, emoji and a non-breaking space", () => {
    for (const fine of ["Re: Hello", "Caf\u00e9 \u{1F600}", "a\u00a0b", ""]) expect(hasControl(fine)).toBe(false);
  });
});
