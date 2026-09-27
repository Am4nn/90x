import { describe, expect, it } from "vitest";
import { storiesBlock, StorySchema } from "./story-rules";

describe("StorySchema", () => {
  it("needs a title and accepts only known tags", () => {
    const base = { title: "Billing migration", situation: "", task: "", action: "", result: "", tags: ["impact"] };
    expect(StorySchema.safeParse(base).success).toBe(true);
    expect(StorySchema.safeParse({ ...base, title: "  " }).success).toBe(false);
    expect(StorySchema.safeParse({ ...base, tags: ["heroics"] }).success).toBe(false);
  });
});

describe("storiesBlock", () => {
  it("lists each story with tags and a clipped STAR summary", () => {
    const block = storiesBlock([
      {
        id: "1",
        title: "Billing migration",
        situation: "Old system",
        task: "Move it",
        action: "a".repeat(500),
        result: "",
        tags: ["impact"],
      },
    ]);
    expect(block).toContain("- Billing migration [impact]");
    expect(block).toContain("  S: Old system");
    expect(block).toContain("  R: -");
    expect(block).toMatch(/A: a{399}…/);
  });

  it("says so when there are none", () => {
    expect(storiesBlock([])).toBe("(no stories yet)");
  });
});
