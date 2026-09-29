"use client";

import type { PrimitiveAnswerProps } from "./types";

/** Pick one: tap the single correct option. */
export function PickOne({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const options = card.options ?? [];
  return (
    <ul className="flex flex-col gap-2" aria-label="Options">
      {options.map((option, index) => (
        <li key={index}>
          <button
            type="button"
            disabled={pending}
            aria-busy={busy === "check" || undefined}
            onClick={() => onSubmit({ cardId: card.id, shape: "chosen", picked: [index] }, index)}
            className="flex w-full items-start gap-3 rounded-xl border border-line-2 px-4 py-3 text-left text-text hover:border-cyan disabled:opacity-60"
          >
            <span className="font-display font-semibold text-mute">{String.fromCharCode(65 + index)}</span>
            <span>{option}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
