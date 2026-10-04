"use client";

import { useState } from "react";
import { ChosenCheckBar } from "./check-bar";
import { Hint } from "./hint";
import type { PrimitiveAnswerProps } from "./types";

/** Pick one: tap the single option you think is right, then Check answer. */
export function PickOne({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const options = card.options?.shape === "list" ? card.options.items : [];
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <Hint>Pick one.</Hint>
      <ul className="flex flex-col gap-2" aria-label="Options">
        {options.map((option, index) => {
          const on = selected === index;
          return (
            <li key={index}>
              <button
                type="button"
                disabled={pending}
                aria-pressed={on}
                onClick={() => setSelected(index)}
                className={`flex min-h-12 w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left text-body text-text transition-colors disabled:opacity-60 ${
                  on ? "border-cyan bg-cyan-bg" : "border-line-2 bg-surface hover:border-mute"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-px flex size-6 shrink-0 items-center justify-center rounded-full border font-sans text-tag font-bold ${
                    on ? "border-cyan text-cyan" : "border-line-2 text-text-2"
                  }`}
                >
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="min-w-0">{option}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <ChosenCheckBar card={card} selected={selected} pending={pending} busy={busy} onSubmit={onSubmit} />
    </div>
  );
}
