"use client";

import { useState } from "react";
import { CheckBar } from "./check-bar";
import type { PrimitiveAnswerProps } from "./types";

/** Claim grid: a true/false judgement on every row, forced. Both states stay
 *  reachable and the form refuses to submit until every row is answered. */
export function ClaimGrid({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const rows = card.options?.shape === "list" ? card.options.items : [];
  const [answers, setAnswers] = useState<(0 | 1 | null)[]>(() => rows.map(() => null));

  const unanswered = answers.filter((answer) => answer === null).length;
  const complete = unanswered === 0;

  const set = (row: number, value: 0 | 1) => setAnswers((current) => current.map((answer, i) => (i === row ? value : answer)));

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2.5" aria-label="Statements">
        {rows.map((row, index) => (
          <li key={index} className="rounded-xl border border-line bg-surface p-3">
            <div className="flex flex-col gap-2.5">
              <p className="text-body text-text">{row}</p>
              <div role="group" aria-label={`${row}: true or false`} className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  aria-pressed={answers[index] === 0}
                  onClick={() => set(index, 0)}
                  className={`min-h-11 flex-1 rounded-xl border text-small font-semibold transition-colors disabled:opacity-60 ${
                    answers[index] === 0
                      ? "border-cyan bg-cyan-bg text-cyan"
                      : "border-line-2 text-text-2 hover:border-mute hover:text-text"
                  }`}
                >
                  False
                </button>
                <button
                  type="button"
                  disabled={pending}
                  aria-pressed={answers[index] === 1}
                  onClick={() => set(index, 1)}
                  className={`min-h-11 flex-1 rounded-xl border text-small font-semibold transition-colors disabled:opacity-60 ${
                    answers[index] === 1
                      ? "border-cyan bg-cyan-bg text-cyan"
                      : "border-line-2 text-text-2 hover:border-mute hover:text-text"
                  }`}
                >
                  True
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <CheckBar
        pending={pending}
        busy={busy}
        complete={complete}
        warn
        hint={complete ? "Ready to check" : "Answer every row"}
        onCheck={() =>
          onSubmit({
            cardId: card.id,
            shape: "mapping",
            pairs: answers.flatMap((answer, i) => (answer === null ? [] : [[i, answer] as [number, number]])),
          })
        }
      />
    </div>
  );
}
