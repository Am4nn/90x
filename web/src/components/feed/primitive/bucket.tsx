"use client";

import { useState } from "react";
import { CheckBar } from "./check-bar";
import type { PrimitiveAnswerProps } from "./types";

/** Bucket: tap an item to arm it, tap a column to place it there. Each item
 *  lands in exactly one column — one tick per row, enforced in the UI. */
export function Bucket({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const items = card.options?.shape === "bucket" ? card.options.items : [];
  const columns = card.options?.shape === "bucket" ? card.options.columns : [];
  const [assigned, setAssigned] = useState<(number | null)[]>(() => items.map(() => null));
  const [armed, setArmed] = useState<number | null>(null);

  const complete = assigned.every((column) => column !== null);
  const countIn = (column: number) => assigned.filter((c) => c === column).length;

  const armItem = (index: number) => setArmed((current) => (current === index ? null : index));

  const placeIn = (column: number) => {
    if (armed === null) return;
    const item = armed;
    setAssigned((current) => current.map((c, i) => (i === item ? column : c)));
    setArmed(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <ul aria-label="Items" className="flex flex-col gap-2">
          {items.map((item, index) => {
            const column = assigned[index];
            return (
              <li key={index}>
                <button
                  type="button"
                  disabled={pending}
                  aria-pressed={armed === index}
                  aria-label={column != null ? `${item} — in ${columns[column]}` : item}
                  onClick={() => armItem(index)}
                  className={`min-h-11 w-full rounded-xl border px-3 py-2.5 text-left text-body transition-colors disabled:opacity-60 ${
                    armed === index
                      ? "border-cyan bg-cyan-bg text-text"
                      : column != null
                        ? "border-line bg-surface-2 text-text"
                        : "border-line-2 bg-surface text-text hover:border-mute"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span>{item}</span>
                    {column != null && (
                      <span aria-hidden className="text-cyan">
                        ✓
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <ul aria-label="Columns" className="flex flex-col gap-2">
          {columns.map((column, index) => (
            <li key={index}>
              <button
                type="button"
                disabled={pending || armed === null}
                onClick={() => placeIn(index)}
                aria-label={column}
                className={`min-h-11 w-full rounded-xl border px-3 py-2.5 text-left text-body transition-colors disabled:opacity-60 ${
                  armed !== null ? "border-cyan bg-surface text-text hover:bg-cyan-bg" : "border-line-2 bg-surface text-text"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span>{column}</span>
                  <span className="tabular text-small text-mute">{countIn(index)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <CheckBar
        pending={pending}
        busy={busy}
        complete={complete}
        hint={complete ? "Ready to check" : `${assigned.filter((c) => c === null).length} left to place`}
        onCheck={() =>
          onSubmit({
            cardId: card.id,
            shape: "mapping",
            pairs: assigned.flatMap((c, i) => (c === null ? [] : [[i, c] as [number, number]])),
          })
        }
      />
    </div>
  );
}
