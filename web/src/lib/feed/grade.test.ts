import { describe, expect, it } from "vitest";
import {
  type CardAnswer,
  gradeCard,
  gradeChosen,
  gradeMapping,
  gradeNumber,
  gradeOrdered,
  isAlternative,
  isGraded,
  outcomeOf,
  parseAlternatives,
  PASS_MARK,
  scoreToRating,
  type Pair,
} from "./grade";

const chosenCard = (picked: number[], whyStep: CardAnswer["whyStep"] = null): CardAnswer => ({
  shape: "chosen",
  picked,
  whyStep,
});

describe("gradeChosen", () => {
  it("the exact set is correct, in any order", () => {
    expect(gradeChosen([0, 2], [0, 2])).toBe(1);
    expect(gradeChosen([2, 0], [0, 2])).toBe(1);
  });

  it("a subset is wrong", () => {
    expect(gradeChosen([0], [0, 2])).toBe(0);
  });

  it("a superset is wrong", () => {
    expect(gradeChosen([0, 1, 2], [0, 2])).toBe(0);
  });

  it("an empty pick is wrong", () => {
    expect(gradeChosen([], [0, 2])).toBe(0);
  });

  it("a duplicated pick of the right length is wrong", () => {
    expect(gradeChosen([0, 0], [0, 2])).toBe(0);
  });
});

describe("gradeCard and the why-step", () => {
  it("a correct answer on a card without a why-step is right", () => {
    expect(gradeCard(chosenCard([0]), { shape: "chosen", picked: [0] })).toBe(1);
  });

  it("a missing why on a card that has a why-step is wrong", () => {
    expect(gradeCard(chosenCard([0], { options: ["a", "b"], correct: 0 }), { shape: "chosen", picked: [0] })).toBe(0);
  });

  it("a correct why plus a correct answer is right", () => {
    expect(gradeCard(chosenCard([0], { options: ["a", "b"], correct: 1 }), { shape: "chosen", picked: [0], why: 1 })).toBe(1);
  });

  it("right answer, wrong reason is wrong", () => {
    expect(gradeCard(chosenCard([0], { options: ["a", "b"], correct: 0 }), { shape: "chosen", picked: [0], why: 1 })).toBe(0);
  });

  it("a wrong answer with the right reason is still wrong", () => {
    expect(gradeCard(chosenCard([0], { options: ["a", "b"], correct: 0 }), { shape: "chosen", picked: [1], why: 0 })).toBe(0);
  });
});

describe("gradeOrdered", () => {
  // a before c, b before c; a and b are free to swap.
  const constraints: Pair[] = [
    [0, 2],
    [1, 2],
  ];

  it("accepts both valid orderings", () => {
    expect(gradeOrdered([0, 1, 2], constraints, 3)).toBe(1);
    expect(gradeOrdered([1, 0, 2], constraints, 3)).toBe(1);
  });

  it("rejects an order that violates a constraint", () => {
    expect(gradeOrdered([2, 0, 1], constraints, 3)).toBe(0);
  });

  it("rejects a missing item", () => {
    expect(gradeOrdered([0, 1], constraints, 3)).toBe(0);
  });

  it("rejects a duplicated item", () => {
    expect(gradeOrdered([0, 0, 2], constraints, 3)).toBe(0);
  });
});

describe("gradeOrdered with alternatives", () => {
  // tokens: 0 "x", 1 "+", 2 "1": the line is "x + 1" (a chain), and "1 + x" is the same sum.
  const chain: Pair[] = [
    [0, 1],
    [1, 2],
  ];
  const alternatives = [[2, 1, 0]];

  it("accepts the canonical order and each listed alternative", () => {
    expect(gradeOrdered([0, 1, 2], chain, 3, alternatives)).toBe(1);
    expect(gradeOrdered([2, 1, 0], chain, 3, alternatives)).toBe(1);
  });

  it("still rejects a swap that is not listed", () => {
    expect(gradeOrdered([1, 0, 2], chain, 3, alternatives)).toBe(0);
    expect(gradeOrdered([0, 2, 1], chain, 3, alternatives)).toBe(0);
  });

  it("an old card with no alternatives grades exactly as before", () => {
    expect(gradeOrdered([2, 1, 0], chain, 3)).toBe(0);
    expect(gradeOrdered([2, 1, 0], chain, 3, [])).toBe(0);
    expect(gradeOrdered([0, 1, 2], chain, 3)).toBe(1);
  });

  it("an alternative of the wrong length or with a repeat never passes", () => {
    expect(gradeOrdered([2, 1], chain, 3, alternatives)).toBe(0);
    expect(gradeOrdered([2, 2, 0], chain, 3, [[2, 2, 0]])).toBe(0);
  });

  it("goes through gradeCard, and the why-step still has to be right", () => {
    const card: CardAnswer = { shape: "ordered", constraints: chain, count: 3, alternatives, whyStep: null };
    expect(gradeCard(card, { shape: "ordered", order: [2, 1, 0] })).toBe(1);
    expect(gradeCard(card, { shape: "ordered", order: [1, 2, 0] })).toBe(0);
    const hard: CardAnswer = { ...card, whyStep: { options: ["a", "b"], correct: 1 } };
    expect(gradeCard(hard, { shape: "ordered", order: [2, 1, 0], why: 0 })).toBe(0);
    expect(gradeCard(hard, { shape: "ordered", order: [2, 1, 0], why: 1 })).toBe(1);
  });

  it("isAlternative matches whole orders only", () => {
    expect(isAlternative([2, 1, 0], alternatives)).toBe(true);
    expect(isAlternative([2, 1], alternatives)).toBe(false);
    expect(isAlternative([0, 1, 2], alternatives)).toBe(false);
  });
});

describe("parseAlternatives", () => {
  it("reads the permutations stored beside the before pairs", () => {
    expect(parseAlternatives({ before: [[0, 1]], alternatives: [[1, 0]] }, 2)).toEqual([[1, 0]]);
  });

  it("is empty for an old card or a missing field", () => {
    expect(parseAlternatives({ before: [[0, 1]] }, 2)).toEqual([]);
    expect(parseAlternatives(null, 2)).toEqual([]);
  });

  it("drops entries that are not full permutations", () => {
    expect(parseAlternatives({ alternatives: [[1, 0], [0], [0, 0], [0, 5], "x", [1.5, 0]] }, 2)).toEqual([[1, 0]]);
  });
});

describe("gradeMapping", () => {
  const correct: Pair[] = [
    [0, 1],
    [1, 0],
  ];

  it("an exact one-to-one match is right", () => {
    expect(gradeMapping(correct, correct)).toBe(1);
  });

  it("one pair wrong is wrong", () => {
    expect(
      gradeMapping(
        [
          [0, 1],
          [1, 1],
        ],
        correct,
      ),
    ).toBe(0);
  });

  it("all pairs wrong is wrong", () => {
    expect(
      gradeMapping(
        [
          [0, 0],
          [1, 1],
        ],
        correct,
      ),
    ).toBe(0);
  });

  it("a pair that points at two targets is a type error", () => {
    // The tuple type forbids a third element: this is checked by `tsc`, not at runtime.
    // @ts-expect-error a mapping pair is exactly [number, number]
    const bad: Pair[] = [[0, 1, 2]];
    void bad;
  });
});

describe("gradeNumber", () => {
  it("accepts exactly at the tolerance boundary", () => {
    expect(gradeNumber(10.5, 10, 0.5)).toBe(1);
    expect(gradeNumber(9.5, 10, 0.5)).toBe(1);
  });

  it("rejects just past the tolerance boundary", () => {
    expect(gradeNumber(10.500001, 10, 0.5)).toBe(0);
    expect(gradeNumber(9.499999, 10, 0.5)).toBe(0);
  });
});
describe("outcomeOf", () => {
  it("skip wins, then the pass mark decides", () => {
    expect(outcomeOf(1, true)).toBe("skipped");
    expect(outcomeOf(PASS_MARK, false)).toBe("correct");
    expect(outcomeOf(0.699, false)).toBe("wrong");
  });

  it("a zero score is wrong, never correct", () => {
    expect(outcomeOf(0, false)).toBe("wrong");
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
});

describe("isGraded", () => {
  it("correct and wrong are grades; skip and declarations are not", () => {
    expect(isGraded("correct")).toBe(true);
    expect(isGraded("wrong")).toBe(true);
    expect(isGraded("skipped")).toBe(false);
    expect(isGraded("new_to_me")).toBe(false);
    expect(isGraded("known")).toBe(false);
  });
});
