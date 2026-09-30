"use client";

import { useState } from "react";
import { CheckBar } from "./check-bar";
import type { PrimitiveAnswerProps } from "./types";

/** Assemble: tap tokens from the pool into the line, left to right. Pre-filled
 *  tokens (a word-bank template) stay put; only the gaps are asked for. */
export function Assemble({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const tokens = card.options?.shape === "assemble" ? card.options.tokens : [];
  const fixed = card.options?.shape === "assemble" ? card.options.fixed : tokens.map(() => null);

  const [slots, setSlots] = useState<(number | null)[]>(() => tokens.map((_, i) => fixed[i] ?? null));

  const gaps = tokens.map((_, i) => i).filter((i) => fixed[i] === null);
  const inPool = (index: number) => slots.every((slot) => slot !== index);
  const pool = gaps.filter(inPool);
  const nextGap = gaps.find((slot) => slots[slot] === null);
  const complete = slots.every((slot) => slot !== null);

  const place = (index: number) => {
    if (nextGap === undefined) return;
    setSlots((current) => current.map((slot, i) => (i === nextGap ? index : slot)));
  };

  const remove = (slot: number) => {
    setSlots((current) => current.map((value, i) => (i === slot ? null : value)));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3" aria-label="Your answer">
        {slots.map((placed, slot) => {
          const pre = fixed[slot] ?? null;
          if (pre !== null) {
            return (
              <span key={slot} className="rounded-lg border border-line-2 bg-surface-2 px-3 py-2 text-body text-text-2">
                {tokens[pre]}
              </span>
            );
          }
          if (placed === null) {
            return (
              <span
                key={slot}
                className="min-h-11 min-w-16 rounded-lg border border-dashed border-line px-3 py-2 text-center text-body text-mute"
              >
                ···
              </span>
            );
          }
          return (
            <button
              key={slot}
              type="button"
              disabled={pending}
              onClick={() => remove(slot)}
              aria-label={`Remove ${tokens[placed]} from the answer`}
              className="min-h-11 rounded-lg border border-cyan bg-cyan-bg px-3 py-2 text-body text-text hover:border-bad disabled:opacity-60"
            >
              {tokens[placed]}
            </button>
          );
        })}
      </div>

      {pool.length > 0 && (
        <ul aria-label="Tokens" className="flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
          {pool.map((index) => (
            <li key={index}>
              <button
                type="button"
                disabled={pending}
                onClick={() => place(index)}
                className="min-h-11 w-full rounded-xl border border-line-2 bg-surface px-4 py-2.5 text-left text-body text-text hover:border-cyan disabled:opacity-60"
              >
                {tokens[index]}
              </button>
            </li>
          ))}
        </ul>
      )}

      <CheckBar
        pending={pending}
        busy={busy}
        complete={complete}
        hint={complete ? "Ready to check" : `${pool.length} token${pool.length === 1 ? "" : "s"} left`}
        onCheck={() => onSubmit({ cardId: card.id, shape: "ordered", order: slots.map((placed) => placed ?? 0) })}
      />
    </div>
  );
}
