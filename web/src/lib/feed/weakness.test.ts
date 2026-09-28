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

describe("declared outcomes", () => {
  it("never makes a topic look weak or strong", () => {
    // "New to me" says nothing about performance. Counting it as a miss would
    // pull the Feed toward topics the reader has only declared, not tried.
    const declared = topicWeakness([
      { topic: "caching", outcome: "new_to_me" },
      { topic: "caching", outcome: "new_to_me" },
      { topic: "caching", outcome: "known" },
    ]);
    expect(declared.get("caching")).toBeUndefined();
  });

  it("still counts real answers on a topic that also has declarations", () => {
    const mixed = topicWeakness([
      { topic: "caching", outcome: "wrong" },
      { topic: "caching", outcome: "correct" },
      { topic: "caching", outcome: "new_to_me" },
    ]);
    expect(mixed.get("caching")).toBe(0.5);
  });

  it("keeps treating a skip as evidence of struggle", () => {
    const skipped = topicWeakness([
      { topic: "caching", outcome: "skipped" },
      { topic: "caching", outcome: "skipped" },
    ]);
    expect(skipped.get("caching")).toBe(1);
  });
});

describe("the weak pool only draws on evidence", () => {
  it("ignores a topic with a single answer", () => {
    // One answer says too little to call a topic weak, so a first wrong guess
    // never drags the Feed toward something the reader has barely met.
    expect(topicWeakness([{ topic: "caching", outcome: "wrong" }]).get("caching")).toBeUndefined();
  });

  it("never ranks a topic with no answers at all", () => {
    expect(weakTopics(topicWeakness([]), [])).toEqual([]);
  });

  it("only takes patterns the check-ins actually call weak", () => {
    // masteryState returns "untouched" with no attempts and "weak" only when
    // failures outnumber solves, so an unstudied pattern cannot arrive here.
    expect(weakTopics(new Map(), ["two-pointers"])).toEqual(["two-pointers"]);
    expect(weakTopics(new Map(), [])).toEqual([]);
  });
});
