"use client";

import { PRIMARY, SECONDARY } from "@/components/button-styles";
import type { PrimitiveAnswerProps } from "./types";

/** Self-rate: the reader says whether they knew this one. No right answer, so
 *  got counts as a hit and missed as a miss. */
export function SelfRate({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  return (
    <div className="flex gap-2.5">
      <button
        type="button"
        disabled={pending}
        aria-busy={busy === "self" || undefined}
        onClick={() => onSubmit({ cardId: card.id, selfMark: "missed" })}
        className={`flex-1 ${SECONDARY}`}
      >
        Missed it
      </button>
      <button
        type="button"
        disabled={pending}
        aria-busy={busy === "self" || undefined}
        onClick={() => onSubmit({ cardId: card.id, selfMark: "got" })}
        className={`flex-1 ${PRIMARY}`}
      >
        Got it
      </button>
    </div>
  );
}
