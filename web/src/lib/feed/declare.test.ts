import { describe, expect, it } from "vitest";
import { canDeclareKnown } from "./declare";

let nextCard = 0;
const card = () => `card-${++nextCard}`;
const answers = (correct: number, wrong = 0) => [
  ...Array.from({ length: correct }, () => ({ outcome: "correct" as const, cardId: card() })),
  ...Array.from({ length: wrong }, () => ({ outcome: "wrong" as const, cardId: card() })),
];

describe("canDeclareKnown", () => {
  it("needs a third of the topic's cards, not a fixed count", () => {
    // A topic holds 8-12 cards. Requiring ten answers would mean answering
    // nearly every card before the button appears, leaving nothing to retire.
    expect(canDeclareKnown({ answers: answers(4), cardsInTopic: 12 })).toBe(true);
    expect(canDeclareKnown({ answers: answers(3), cardsInTopic: 12 })).toBe(false);
    expect(canDeclareKnown({ answers: answers(3), cardsInTopic: 8 })).toBe(true);
  });

  it("never fires on one lucky answer", () => {
    expect(canDeclareKnown({ answers: answers(1), cardsInTopic: 3 })).toBe(false);
    expect(canDeclareKnown({ answers: answers(2), cardsInTopic: 3 })).toBe(false);
  });

  it("holds the accuracy bar", () => {
    expect(canDeclareKnown({ answers: answers(4, 1), cardsInTopic: 9 })).toBe(true);
    expect(canDeclareKnown({ answers: answers(3, 2), cardsInTopic: 9 })).toBe(false);
  });

  it("ignores declarations, which are not evidence", () => {
    const declared = [...answers(3), { outcome: "new_to_me" as const, cardId: card() }, { outcome: "known" as const, cardId: card() }];
    expect(canDeclareKnown({ answers: declared, cardsInTopic: 8 })).toBe(true);
    // Declarations alone can never unlock it.
    expect(
      canDeclareKnown({
        answers: [
          { outcome: "new_to_me", cardId: card() },
          { outcome: "known", cardId: card() },
        ],
        cardsInTopic: 3,
      }),
    ).toBe(false);
  });

  it("holds a skip against you", () => {
    // Answering three and skipping five is not evidence you know the topic,
    // it is evidence you avoided most of it.
    const avoided = [...answers(3), ...Array.from({ length: 5 }, () => ({ outcome: "skipped" as const, cardId: card() }))];
    expect(canDeclareKnown({ answers: avoided, cardsInTopic: 8 })).toBe(false);
    // One skip among four clean answers still clears 80%.
    expect(canDeclareKnown({ answers: [...answers(4), { outcome: "skipped", cardId: card() }], cardsInTopic: 8 })).toBe(true);
  });
});

describe("coverage counts cards, not answers", () => {
  it("does not unlock from answering one card over and over", () => {
    // A due card answered four times is one card's worth of evidence. Counting
    // the rows would let someone clear a 12-card topic having seen one of
    // them, then retire the other eleven unseen.
    const sameCard = Array.from({ length: 6 }, () => ({ outcome: "correct" as const, cardId: "card-x" }));
    expect(canDeclareKnown({ answers: sameCard, cardsInTopic: 12 })).toBe(false);
  });

  it("unlocks once enough distinct cards have been tried", () => {
    const four = [
      { outcome: "correct" as const, cardId: "a" },
      { outcome: "correct" as const, cardId: "b" },
      { outcome: "correct" as const, cardId: "c" },
      { outcome: "correct" as const, cardId: "d" },
    ];
    expect(canDeclareKnown({ answers: four, cardsInTopic: 12 })).toBe(true);
  });

  it("judges each card on its latest answer", () => {
    // Retrying one card until it is right must not outvote three others.
    const retried = [
      { outcome: "wrong" as const, cardId: "a" },
      { outcome: "correct" as const, cardId: "a" },
      { outcome: "wrong" as const, cardId: "b" },
      { outcome: "wrong" as const, cardId: "c" },
    ];
    expect(canDeclareKnown({ answers: retried, cardsInTopic: 9 })).toBe(false);
  });
});
