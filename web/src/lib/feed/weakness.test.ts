import { describe, expect, it } from "vitest";
import { topicWeakness, weakTopics } from "./weakness";

const answers = (topic: string, outcomes: ("correct" | "wrong" | "skipped")[]) => outcomes.map((outcome) => ({ topic, outcome }));

describe("topicWeakness", () => {
  it("is the share of wrong and skipped answers per topic", () => {
    const got = topicWeakness([...answers("a", ["correct", "wrong", "skipped", "correct"]), ...answers("b", ["wrong", "wrong"])]);
    expect(got.get("a")).toBeCloseTo(0.5);
    expect(got.get("b")).toBe(1);
  });

  it("leaves out topics with fewer than two answers", () => {
    const got = topicWeakness([...answers("a", ["wrong"]), ...answers("b", ["correct", "correct"])]);
    expect(got.has("a")).toBe(false);
    expect(got.get("b")).toBe(0);
  });
});

describe("weakTopics", () => {
  it("keeps topics answered below the pass mark, weakest first", () => {
    const rates = new Map([
      ["fine", 0.1],
      ["bad", 0.9],
      ["shaky", 0.5],
    ]);
    expect(weakTopics(rates, [])).toEqual(["bad", "shaky"]);
  });

  it("70% correct is not weak", () => {
    expect(weakTopics(topicWeakness(answers("edge", ["wrong", "wrong", "wrong", ...Array<"correct">(7).fill("correct")])), [])).toEqual([]);
    expect(
      weakTopics(topicWeakness(answers("edge", ["wrong", "wrong", "wrong", "wrong", ...Array<"correct">(6).fill("correct")])), []),
    ).toEqual(["edge"]);
  });

  it("adds weak DSA patterns after worse card topics, without duplicates", () => {
    const rates = new Map([
      ["two-pointers", 0.6],
      ["java-threads", 1],
      ["heap", 0.4],
    ]);
    expect(weakTopics(rates, ["heap", "graphs"])).toEqual(["java-threads", "two-pointers", "graphs", "heap"]);
  });
});
