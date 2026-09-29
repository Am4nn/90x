"use client";

import { useState } from "react";
import type { PrimitiveAnswerProps } from "./types";

/** Tap in place: the reader taps the one correct line in a snippet. A tap
 *  submits at once — no confirm — so the brief highlight is the only feedback
 *  before the result. Targets are the card's option lines, never JSX. */
export function TapInPlace({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const lines = card.options ?? [];
  const [selected, setSelected] = useState<number | null>(null);

  const choose = (index: number) => {
    if (pending) return;
    setSelected(index);
    onSubmit({ cardId: card.id, shape: "chosen", picked: [index] }, index);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-line bg-surface py-2">
        <ol className="w-max min-w-full" aria-label="Options">
          {lines.map((line, index) => (
            <li key={index}>
              <button
                type="button"
                disabled={pending}
                aria-busy={(selected === index && busy === "check") || undefined}
                aria-label={`Line ${index + 1}: ${line}`}
                onClick={() => choose(index)}
                className={`flex w-full items-start font-mono text-small leading-relaxed text-text transition-colors disabled:opacity-60 ${
                  selected === index ? "bg-cyan-bg" : "hover:bg-surface-2"
                }`}
              >
                <span
                  aria-hidden
                  className={`w-10 shrink-0 pr-2 pl-3 text-right select-none ${selected === index ? "text-cyan" : "text-mute"}`}
                >
                  {index + 1}
                </span>
                <span className="pr-4 whitespace-pre">{line || " "}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <span aria-live="polite" className="sr-only">
        {selected !== null ? `Line ${selected + 1} selected` : ""}
      </span>
    </div>
  );
}
