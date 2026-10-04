"use client";

import { CARD_SKIP } from "./check-bar";
import { Hint } from "./hint";
import type { PrimitiveAnswerProps } from "./types";

/** Self-rate: the reader judges whether they knew this one. No right answer, so
 *  got counts as a hit and missed as a miss. The pair is the whole screen; Skip
 *  moves to the quiet row beneath the card. */
export function SelfRate({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  return (
    <div className="flex flex-col gap-5">
      <Hint>Answer it in your head, then say how it went.</Hint>
      <div role="group" aria-label="Rate yourself" className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          disabled={pending}
          aria-busy={busy === "self" || undefined}
          onClick={() => onSubmit({ cardId: card.id, selfMark: "missed" })}
          className={CARD_SKIP}
        >
          Missed it
        </button>
        <button
          type="button"
          disabled={pending}
          aria-busy={busy === "self" || undefined}
          onClick={() => onSubmit({ cardId: card.id, selfMark: "got" })}
          className={CARD_SKIP}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
