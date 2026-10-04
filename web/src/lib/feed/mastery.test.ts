import { describe, expect, it } from "vitest";
import type { Outcome } from "./grade";
import { topicMastered } from "./mastery";

const a = (cardId: string, outcome: Outcome) => ({ cardId, outcome });
const correct = (n: number) => Array.from({ length: n }, (_, i) => a(`c${i}`, "correct"));

describe("topicMastered", () => {
  it("needs six distinct graded cards", () => {
    expect(topicMastered(correct(5))).toBe(false);
    expect(topicMastered(correct(6))).toBe(true);
  });

  it("needs 85% of cards correct by their latest answer", () => {
    // 6 of 7 is 85.7%; 5 of 6 is 83%.
    expect(topicMastered([...correct(6), a("x", "wrong")])).toBe(true);
    expect(topicMastered([...correct(5), a("x", "wrong")])).toBe(false);
  });

  it("counts a card once, by its latest answer, however often it was answered", () => {
    const repeated = Array.from({ length: 10 }, () => a("same", "correct"));
    expect(topicMastered(repeated)).toBe(false);
    // An old miss that was later answered correctly no longer counts against the topic.
    expect(topicMastered([a("c0", "wrong"), ...correct(6)])).toBe(true);
    // The reverse: a recent miss on a card once answered correctly does.
    expect(topicMastered([...correct(6), a("c0", "wrong"), a("c1", "wrong")])).toBe(false);
  });

  it("ignores skips and declarations", () => {
    const noise = [a("s1", "skipped"), a("s2", "skipped"), a("n1", "new_to_me"), a("k1", "known")];
    expect(topicMastered([...correct(6), ...noise])).toBe(true);
    expect(topicMastered([...correct(5), ...noise])).toBe(false);
  });

  it("is false for nothing", () => {
    expect(topicMastered([])).toBe(false);
  });
});
