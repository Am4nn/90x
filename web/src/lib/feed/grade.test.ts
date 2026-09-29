import { describe, expect, it } from "vitest";
import {
  type CardAnswer,
  gradeCard,
  gradeChosen,
  gradeMapping,
  gradeNumber,
  gradeOrdered,
  gradeSelfRate,
  isGraded,
  outcomeOf,
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

describe("gradeSelfRate", () => {
  it("got → 1, missed → 0", () => {
    expect(gradeSelfRate("got")).toBe(1);
    expect(gradeSelfRate("missed")).toBe(0);
  });

  // Self-rate has no answer shape, so it never reaches the chosen/number graders.
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
