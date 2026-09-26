import { describe, expect, it } from "vitest";
import {
  type CardFormat,
  type CardForGrading,
  exactMatch,
  gradeOption,
  gradeOutput,
  keyPointScore,
  normalize,
  OPTIONS_SCORE,
  outcomeOf,
  PASS_MARK,
  scoreToRating,
} from "./grade";

const card = (over: Partial<CardForGrading> = {}): CardForGrading => ({
  format: "typed",
  answer: "A hash map",
  keyPoints: [],
  options: null,
  ...over,
});

describe("normalize", () => {
  it("lowercases and strips markdown, punctuation and extra whitespace", () => {
    expect(normalize("  **Hash** _map_,   with ~~O(1)~~ lookups!  ")).toBe("hash map with o 1 lookups");
    expect(normalize("> # [Two pointers](https://x.dev)")).toBe("two pointers https x dev");
  });

  it("drops code fences and their language tag but keeps the code", () => {
    expect(normalize("```java\nreturn  x;\n```")).toBe("return x");
  });

  it("drops apostrophes so contractions stay one word", () => {
    expect(normalize("It's Dijkstra’s")).toBe("its dijkstras");
  });
});

describe("exactMatch", () => {
  it("matches the answer despite formatting noise", () => {
    expect(exactMatch("a **HASH** map.", card())).toBe(true);
    expect(exactMatch("a tree map", card())).toBe(false);
  });

  it("treats flash cards like typed cards", () => {
    const formats: CardFormat[] = ["typed", "flash"];
    for (const format of formats) expect(exactMatch("A hash map", card({ format }))).toBe(true);
  });

  it("matches when every key point appears in the answer", () => {
    const withPoints = card({ answer: "Something long", keyPoints: ["O(n log n)", "stable"] });
    expect(exactMatch("Merge sort is stable and runs in O(n log n).", withPoints)).toBe(true);
    expect(exactMatch("Merge sort runs in O(n log n).", withPoints)).toBe(false);
  });

  it("matches key points on word boundaries only", () => {
    expect(exactMatch("it takes 10 steps", card({ answer: "x", keyPoints: ["1"] }))).toBe(false);
    expect(exactMatch("it takes 1 step", card({ answer: "x", keyPoints: ["1"] }))).toBe(true);
  });

  it("needs at least one key point for the key-point path", () => {
    expect(exactMatch("anything", card({ answer: "x", keyPoints: [] }))).toBe(false);
    expect(exactMatch("anything", card({ answer: "x", keyPoints: ["!!"] }))).toBe(false);
  });

  it("never matches an empty answer", () => {
    expect(exactMatch("  ", card({ answer: "?", keyPoints: [] }))).toBe(false);
  });
});

describe("gradeOutput", () => {
  const output = card({ format: "output", answer: "```\n[1, 2, 3]\ndone\n```" });

  it("ignores whitespace and newline differences", () => {
    expect(gradeOutput("[1,2,3] done", output)).toBe(1);
    expect(gradeOutput("  [1,  2,\n3]\r\n\ndone  ", output)).toBe(1);
  });

  it("keeps punctuation, signs and case", () => {
    expect(gradeOutput("[12, 3] done", output)).toBe(0);
    expect(gradeOutput("-1", card({ format: "output", answer: "1" }))).toBe(0);
    expect(gradeOutput("True", card({ format: "output", answer: "true" }))).toBe(0);
  });

  it("accepts inline code formatting", () => {
    expect(gradeOutput("`42`", card({ format: "output", answer: "42" }))).toBe(1);
  });
});

describe("gradeOption", () => {
  const options = ["O(n)", "O(log n)", "O(1)", "O(n^2)"];

  it("scores a pick by option text", () => {
    const mcq = card({ format: "mcq", answer: "O(log n)", options });
    expect(gradeOption(1, mcq)).toBe(OPTIONS_SCORE);
    expect(gradeOption(0, mcq)).toBe(0);
  });

  it("scores a pick when the answer is the option's letter or index", () => {
    expect(gradeOption(2, card({ format: "mcq", answer: "C", options }))).toBe(OPTIONS_SCORE);
    expect(gradeOption(2, card({ format: "mcq", answer: "c", options }))).toBe(OPTIONS_SCORE);
    expect(gradeOption(3, card({ format: "mcq", answer: "3", options }))).toBe(OPTIONS_SCORE);
    expect(gradeOption(1, card({ format: "mcq", answer: "C", options }))).toBe(0);
  });

  it("scores 0 without options or out of range", () => {
    expect(gradeOption(0, card({ answer: "O(n)", options: null }))).toBe(0);
    const mcq = card({ format: "mcq", answer: "O(n)", options });
    expect(gradeOption(-1, mcq)).toBe(0);
    expect(gradeOption(4, mcq)).toBe(0);
    expect(gradeOption(0.5, mcq)).toBe(0);
  });
});

describe("outcomeOf", () => {
  it("skip wins, then the pass mark decides", () => {
    expect(outcomeOf(1, true)).toBe("skipped");
    expect(outcomeOf(PASS_MARK, false)).toBe("correct");
    expect(outcomeOf(0.699, false)).toBe("wrong");
  });
});

describe("scoreToRating", () => {
  it("maps boundary scores to Again/Hard/Good/Easy", () => {
    expect(scoreToRating(0, false)).toBe(1);
    expect(scoreToRating(0.699, false)).toBe(1);
    expect(scoreToRating(0.7, false)).toBe(2);
    expect(scoreToRating(0.849, false)).toBe(2);
    expect(scoreToRating(0.85, false)).toBe(3);
    expect(scoreToRating(0.999, false)).toBe(3);
    expect(scoreToRating(1, false)).toBe(4);
  });

  it("a skip is always Again", () => {
    expect(scoreToRating(1, true)).toBe(1);
  });

  it("a correct pick after Show options is Hard", () => {
    expect(scoreToRating(OPTIONS_SCORE, false)).toBe(2);
  });
});

describe("keyPointScore", () => {
  it("is the share of key points hit", () => {
    expect(keyPointScore([true, false, true, false])).toBe(0.5);
    expect(keyPointScore([true, true])).toBe(1);
    expect(keyPointScore([])).toBe(0);
  });
});
