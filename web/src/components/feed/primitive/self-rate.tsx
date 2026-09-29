"use client";

import { PRIMARY, SECONDARY } from "@/components/button-styles";
import type { PrimitiveAnswerProps } from "./types";

/** Self-rate: the reader judges whether they knew this one. No right answer, so
 *  got counts as a hit and missed as a miss. The pair is the whole screen and
 *  reads as a self-judgement, not a menu. */
export function SelfRate({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  return (
    <div role="group" aria-label="Rate yourself" className="flex flex-col gap-2.5 md:flex-row">
      <button
        type="button"
        disabled={pending}
        aria-busy={busy === "self" || undefined}
        onClick={() => onSubmit({ cardId: card.id, selfMark: "missed" })}
        className={`w-full md:flex-1 ${SECONDARY}`}
      >
        Missed it
      </button>
      <button
        type="button"
        disabled={pending}
        aria-busy={busy === "self" || undefined}
        onClick={() => onSubmit({ cardId: card.id, selfMark: "got" })}
        className={`w-full md:flex-1 ${PRIMARY}`}
      >
        Got it
      </button>
    </div>
  );
}
