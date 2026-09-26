import { describe, expect, it } from "vitest";
import type { Submission } from "./source";
import { summarize } from "./sync";

const t = (min: number) => 1_790_000_000 + min * 60; // unix seconds
const sub = (slug: string, min: number, status: string, id = `${slug}-${min}`): Submission => ({
  id,
  slug,
  title: slug,
  timestamp: t(min),
  status,
  lang: "java",
});

describe("summarize", () => {
  it("first-try accept is solved with 1 attempt and no suggested time", () => {
    const [r] = summarize([sub("two-sum", 10, "Accepted")]);
    expect(r).toMatchObject({ slug: "two-sum", result: "solved", attempts: 1, minutesSuggested: null, externalId: "two-sum-10" });
  });

  it("accept after failures counts attempts and suggests first-to-accepted minutes", () => {
    const [r] = summarize([sub("lru", 0, "Wrong Answer"), sub("lru", 12, "Time Limit Exceeded"), sub("lru", 25, "Accepted")]);
    expect(r).toMatchObject({ result: "solved", attempts: 3, minutesSuggested: 25, externalId: "lru-25" });
  });

  it("only failures means failed, keyed to the latest submission", () => {
    const [r] = summarize([sub("hard", 0, "Wrong Answer"), sub("hard", 5, "Runtime Error")]);
    expect(r).toMatchObject({ result: "failed", attempts: 2, externalId: "hard-5" });
  });

  it("caps the suggestion at two hours and ignores compile errors as attempts", () => {
    const [r] = summarize([sub("x", 0, "Compile Error"), sub("x", 10, "Wrong Answer"), sub("x", 400, "Accepted")]);
    expect(r).toMatchObject({ attempts: 2, minutesSuggested: 120 });
  });

  it("returns one summary per problem", () => {
    expect(summarize([sub("a", 0, "Accepted"), sub("b", 1, "Accepted"), sub("a", 2, "Accepted")])).toHaveLength(2);
  });
});
