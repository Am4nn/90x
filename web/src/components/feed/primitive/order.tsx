"use client";

import { useState } from "react";
import { CheckBar } from "./check-bar";
import type { PrimitiveAnswerProps } from "./types";

/** Order: tap items in the order you want them; they slot into the result rail.
 *  Tapping a placed item sends it back. The pool scrolls on a long card. */
export function Order({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const items = card.options ?? [];
  const [placed, setPlaced] = useState<number[]>([]);

  const remaining = items.map((_, i) => i).filter((i) => !placed.includes(i));
  const complete = remaining.length === 0;

  const place = (index: number) => setPlaced((current) => [...current, index]);
  const remove = (index: number) => setPlaced((current) => current.filter((i) => i !== index));

  return (
    <div className="flex flex-col gap-4">
      <ol aria-label="Your order" className="flex flex-col gap-2">
        {items.map((_, slot) => {
          const index = placed[slot];
          return (
            <li key={slot} className="flex items-center gap-2">
              <span aria-hidden className="w-6 shrink-0 text-right font-display text-small font-semibold text-mute">
                {slot + 1}
              </span>
              {index === undefined ? (
                <span aria-hidden className="min-h-11 flex-1 rounded-xl border border-dashed border-line px-4 py-2.5 text-small text-mute">
                  {slot === placed.length ? "Tap an item" : "·"}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(index)}
                  aria-label={`Remove ${items[index]} from the order`}
                  className="min-h-11 flex-1 rounded-xl border border-cyan bg-cyan-bg px-4 py-2.5 text-left text-body text-text hover:border-bad disabled:opacity-60"
                >
                  {items[index]}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <ul aria-label="Items to place" className="flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
        {remaining.map((index) => (
          <li key={index}>
            <button
              type="button"
              disabled={pending}
              onClick={() => place(index)}
              className="min-h-11 w-full rounded-xl border border-line-2 bg-surface px-4 py-2.5 text-left text-body text-text hover:border-cyan disabled:opacity-60"
            >
              {items[index]}
            </button>
          </li>
        ))}
      </ul>

      <CheckBar
        pending={pending}
        busy={busy}
        complete={complete}
        hint={complete ? "Ready to check" : `${remaining.length} left to place`}
        onCheck={() => onSubmit({ cardId: card.id, shape: "ordered", order: placed })}
      />
    </div>
  );
}
