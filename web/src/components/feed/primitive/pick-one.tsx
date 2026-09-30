"use client";

import type { PrimitiveAnswerProps } from "./types";

/** Pick one: tap the single correct option. A tap submits at once — there is no
 *  separate Check — so the option list is the whole answer surface. */
export function PickOne({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const options = card.options?.shape === "list" ? card.options.items : [];
  return (
    <ul className="flex flex-col gap-2" aria-label="Options">
      {options.map((option, index) => (
        <li key={index}>
          <button
            type="button"
            disabled={pending}
            aria-busy={busy === "check" || undefined}
            onClick={() => onSubmit({ cardId: card.id, shape: "chosen", picked: [index] }, index)}
            className="group flex w-full items-center gap-3 rounded-xl border border-line-2 px-4 py-3 text-left text-body text-text transition-colors hover:border-cyan hover:bg-surface-2 active:bg-surface-2 disabled:opacity-60"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-line-2 font-display text-small font-semibold text-mute transition-colors group-hover:border-cyan group-hover:text-cyan">
              {String.fromCharCode(65 + index)}
            </span>
            <span className="min-w-0">{option}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
