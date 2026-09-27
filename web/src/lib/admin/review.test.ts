import { describe, expect, it } from "vitest";
import { groupByArea, parseQuality, reviewProgress, seedFromId, sourceTitles, stringList, weakScores } from "./review";

describe("seedFromId", () => {
  it("is the same number for the same id and differs between ids", () => {
    const id = "6f1c2d3e-0000-4000-8000-000000000001";
    expect(seedFromId(id)).toBe(seedFromId(id));
    expect(seedFromId(id)).not.toBe(seedFromId("6f1c2d3e-0000-4000-8000-000000000002"));
  });
});

describe("reviewProgress", () => {
  it("counts verdicts and says what's still needed", () => {
    const verdicts = [...Array<"good">(11).fill("good"), "bad" as const, ...Array<null>(8).fill(null)];
    expect(reviewProgress(verdicts)).toEqual({
      size: 20,
      reviewed: 12,
      good: 11,
      bad: 1,
      needed: 18,
      outcome: "pending",
      summary: "12 of 20 reviewed · 11 good",
    });
  });

  it("decides once every sample card has a verdict", () => {
    const verdicts = [...Array<"good">(8).fill("good"), "bad" as const, "bad" as const];
    const progress = reviewProgress(verdicts);
    expect(progress.needed).toBe(9);
    expect(progress.outcome).toBe("rejected");
  });
});

describe("groupByArea", () => {
  it("orders areas DSA, Design, CS, Java, SQL, then anything else, and skips empty ones", () => {
    const groups = groupByArea([{ domain: "sql" }, { domain: "dsa" }, { domain: "lld" }, { domain: "dsa" }]);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["DSA", 2],
      ["SQL", 1],
      ["Other", 1],
    ]);
  });
});

describe("parseQuality", () => {
  it("reads the reviewer's scores and issues", () => {
    expect(parseQuality({ correct: 5, clear: 4, relevant: 5, issues: "Vague prompt" })).toEqual({
      correct: 5,
      clear: 4,
      relevant: 5,
      issues: "Vague prompt",
    });
  });

  it("returns null for anything that isn't a review", () => {
    expect(parseQuality({})).toBeNull();
    expect(parseQuality(null)).toBeNull();
    expect(parseQuality({ correct: "5", clear: 4, relevant: 5 })).toBeNull();
  });

  it("lists scores under 5", () => {
    expect(weakScores({ correct: 5, clear: 4, relevant: 3, issues: "" })).toEqual(["clear", "relevant"]);
  });
});

describe("stringList", () => {
  it("keeps strings and drops everything else", () => {
    expect(stringList(["a", 1, "b"])).toEqual(["a", "b"]);
    expect(stringList(null)).toEqual([]);
  });
});

describe("sourceTitles", () => {
  it("reads titles from source refs and skips refs without one", () => {
    expect(sourceTitles([{ kind: "doc", id: "a", title: "OSTEP 26" }, { kind: "doc", id: "b" }, "x"])).toEqual(["OSTEP 26"]);
  });
});
