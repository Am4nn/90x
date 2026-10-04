"use client";

import { useState } from "react";
import { CheckBar } from "./check-bar";
import { Eyebrow, Hint } from "./hint";
import { Grip } from "./marks";
import type { PrimitiveAnswerProps } from "./types";
import { useDrag } from "./use-drag";

const CHIP =
  "flex min-h-11 cursor-grab touch-none items-center gap-2.5 rounded-lg border py-2.5 pr-3 pl-3.5 text-left text-body leading-label text-pretty transition-colors select-none disabled:opacity-60";

/** Bucket: tap an item to arm it, tap a column to place it there, or drag the item into a
 *  column. Each item lands in exactly one column. A placed item can be tapped or dragged to move it. */
export function Bucket({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const items = card.options?.shape === "bucket" ? card.options.items : [];
  const columns = card.options?.shape === "bucket" ? card.options.columns : [];
  const [assigned, setAssigned] = useState<(number | null)[]>(() => items.map(() => null));
  const [armed, setArmed] = useState<number | null>(null);

  const complete = assigned.every((column) => column !== null);
  const loose = items.map((_, i) => i).filter((i) => assigned[i] === null);

  const armItem = (index: number) => setArmed((current) => (current === index ? null : index));

  const assign = (item: number, column: number | null) => {
    setAssigned((current) => current.map((c, i) => (i === item ? column : c)));
    setArmed(null);
  };

  const { dragging, over, drag } = useDrag({
    onDrop: (source, target) => {
      const item = Number(source.slice(1));
      if (target === "pool") assign(item, null);
      else if (target.startsWith("c")) assign(item, Number(target.slice(1)));
    },
  });

  const chip = (index: number) => {
    const column = assigned[index];
    const on = armed === index;
    return (
      <button
        type="button"
        disabled={pending}
        aria-pressed={on}
        aria-label={column != null ? `${items[index]} — in ${columns[column]}` : items[index]}
        onClick={() => armItem(index)}
        {...drag(`i${index}`)}
        className={`${CHIP} ${dragging === `i${index}` ? "opacity-35" : ""} ${
          on ? "border-cyan bg-cyan-bg text-text" : "border-line-2 bg-surface text-text hover:border-mute"
        }`}
      >
        {items[index]}
        <Grip />
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Hint>
        {armed !== null
          ? `Tap the column for "${items[armed] ?? ""}".`
          : "Tap an item, then its column, or drag it there. Placed items can be dragged or tapped to move."}
      </Hint>

      <div className="flex flex-col gap-4">
        {(loose.length > 0 || dragging !== null) && (
          <div
            data-drop="pool"
            className={`-m-2 flex flex-col gap-2 rounded-xl border p-2 ${
              over?.id === "pool"
                ? "border-cyan bg-cyan-bg"
                : dragging !== null && loose.length === 0
                  ? "border-dashed border-cyan"
                  : "border-transparent"
            }`}
          >
            <Eyebrow>To sort</Eyebrow>
            <ul aria-label="Items" className="flex min-h-11 flex-wrap gap-2">
              {loose.map((index) => (
                <li key={index}>{chip(index)}</li>
              ))}
              {loose.length === 0 && <li className="self-center text-small text-text-2">Drop here to take it back</li>}
            </ul>
          </div>
        )}

        <ul aria-label="Columns" className="flex flex-col gap-4">
          {columns.map((column, columnIndex) => {
            const inside = items.map((_, i) => i).filter((i) => assigned[i] === columnIndex);
            const hovered = over?.id === `c${columnIndex}`;
            return (
              <li key={columnIndex}>
                <div
                  data-drop={`c${columnIndex}`}
                  className={`flex min-h-19 flex-col gap-2 rounded-lg border p-3 transition-colors ${
                    hovered
                      ? "border-cyan bg-cyan-bg"
                      : dragging !== null || armed !== null
                        ? "border-dashed border-cyan bg-surface"
                        : "border-dashed border-mute bg-surface"
                  }`}
                >
                  <button
                    type="button"
                    disabled={pending || armed === null}
                    onClick={() => armed !== null && assign(armed, columnIndex)}
                    aria-label={column}
                    className="flex items-center justify-between gap-2 text-left disabled:opacity-100"
                  >
                    <span className="font-display text-heading leading-chip font-semibold text-text">{column}</span>
                    {(armed !== null || hovered) && (
                      <span className="text-tag font-bold text-cyan">{hovered ? "Drop here" : "Place here"}</span>
                    )}
                  </button>
                  {inside.length > 0 && (
                    <ul aria-label={`In ${column}`} className="flex flex-wrap gap-2">
                      {inside.map((index) => (
                        <li key={index}>{chip(index)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <CheckBar
        pending={pending}
        busy={busy}
        complete={complete}
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
