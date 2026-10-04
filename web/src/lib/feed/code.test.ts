import { describe, expect, it } from "vitest";
import { codeLanguage } from "./code";

describe("codeLanguage", () => {
  it("reads the language off the first fence", () => {
    expect(codeLanguage("Find the bug:\n```python\nx = 1\n```")).toBe("python");
    expect(codeLanguage("```Java\nint x;\n```")).toBe("java");
  });
  it("is null with no fence or an unlabelled one", () => {
    expect(codeLanguage("No code here.")).toBeNull();
    expect(codeLanguage("```\nplain\n```")).toBeNull();
  });
});
