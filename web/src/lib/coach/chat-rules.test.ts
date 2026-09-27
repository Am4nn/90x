import { describe, expect, it } from "vitest";
import { citationsOf, isQuiet, rateCheck, threadTitle, toolLabel, transcriptOf, whenLabel } from "./chat-rules";

describe("threadTitle", () => {
  it("uses the first non-empty line", () => {
    expect(threadTitle("\n\n  Why am I weak at sliding window?\nMore detail here")).toBe("Why am I weak at sliding window?");
  });

  it("strips markdown markers and collapses spaces", () => {
    expect(threadTitle("## **Plan**   my   `week`")).toBe("Plan my week");
  });

  it("cuts long lines on a word and adds an ellipsis", () => {
    const title = threadTitle("Explain consistent hashing and why it beats mod-N sharding when servers come and go in a cache cluster");
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith("…")).toBe(true);
    expect(title).toMatch(/^Explain consistent hashing/);
  });

  it("falls back when there is no text", () => {
    expect(threadTitle("   \n ")).toBe("New chat");
    expect(threadTitle("```")).toBe("New chat");
  });
});

describe("rateCheck", () => {
  const window = { limit: 3, windowMs: 60_000 };

  it("allows messages under the limit and records this one", () => {
    const r = rateCheck([1_000, 2_000], 10_000, window);
    expect(r).toEqual({ allowed: true, retryAfterSec: 0, stamps: [1_000, 2_000, 10_000] });
  });

  it("refuses at the limit and says when the oldest message leaves the window", () => {
    const r = rateCheck([1_000, 2_000, 3_000], 10_000, window);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBe(51);
    expect(r.stamps).toEqual([1_000, 2_000, 3_000]);
  });

  it("forgets messages older than the window", () => {
    const r = rateCheck([1_000, 2_000, 3_000], 61_500, window);
    expect(r.allowed).toBe(true);
    expect(r.stamps).toEqual([2_000, 3_000, 61_500]);
  });

  it("ignores junk in the stored list", () => {
    expect(rateCheck(["x", null, 5_000] as unknown[], 6_000, window).stamps).toEqual([5_000, 6_000]);
  });
});

describe("toolLabel", () => {
  it("says what the coach did, in the past once done", () => {
    expect(toolLabel("get_weak_spots", "done")).toBe("Looked up your weak spots");
    expect(toolLabel("get_weak_spots", "running")).toBe("Looking up your weak spots…");
    expect(toolLabel("search_knowledge", "error")).toBe("Couldn't search the library");
  });

  it("has a plain fallback for tools it doesn't know", () => {
    expect(toolLabel("draw_diagram", "done")).toBe("Used draw diagram");
  });
});

describe("citationsOf", () => {
  it("collects search results once each, in order", () => {
    const parts = [
      { type: "text", text: "hi" },
      {
        type: "tool-search_knowledge",
        state: "output-available",
        output: {
          results: [
            { title: "Primer", url: "https://a.test/1", snippet: "x" },
            { title: "Notes", url: "https://b.test/2", snippet: "y" },
          ],
        },
      },
      {
        type: "tool-search_knowledge",
        state: "output-available",
        output: { results: [{ title: "Primer again", url: "https://a.test/1" }] },
      },
      { type: "tool-get_progress", state: "output-available", output: { results: [{ title: "not a source", url: "https://c.test" }] } },
    ];
    expect(citationsOf(parts)).toEqual([
      { title: "Primer", url: "https://a.test/1" },
      { title: "Notes", url: "https://b.test/2" },
    ]);
  });

  it("skips unfinished calls and results without a web link", () => {
    expect(
      citationsOf([
        { type: "tool-search_knowledge", state: "input-available" },
        { type: "tool-search_knowledge", state: "output-available", output: { results: [{ title: "x", url: "javascript:alert(1)" }] } },
      ]),
    ).toEqual([]);
  });
});

describe("transcriptOf", () => {
  it("keeps only what was said, labelled by speaker", () => {
    expect(
      transcriptOf([
        { role: "user", parts: [{ type: "text", text: "Plan my week" }] },
        {
          role: "assistant",
          parts: [
            { type: "tool-get_plan", state: "output-available", output: {} },
            { type: "text", text: "Do two graph problems." },
          ],
        },
      ]),
    ).toBe("User: Plan my week\n\nCoach: Do two graph problems.");
  });
});

describe("isQuiet", () => {
  it("is quiet after 30 minutes without a message", () => {
    const now = new Date("2026-09-28T12:00:00Z");
    expect(isQuiet("2026-09-28T11:29:00Z", now)).toBe(true);
    expect(isQuiet("2026-09-28T11:31:00Z", now)).toBe(false);
  });
});

describe("whenLabel", () => {
  it("names recent days and dates older ones", () => {
    expect(whenLabel("2026-09-28", "2026-09-28")).toBe("Today");
    expect(whenLabel("2026-09-27", "2026-09-28")).toBe("Yesterday");
    expect(whenLabel("2026-09-23", "2026-09-28")).toBe("Wednesday");
    expect(whenLabel("2026-09-03", "2026-09-28")).toBe("Sep 3");
  });
});
