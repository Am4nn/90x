"use client";

import { useState } from "react";
import { withinLimit } from "@/lib/feed/archetypes";
import { CheckBar } from "./check-bar";
import { Hint } from "./hint";
import { NotBuilt } from "./not-built";
import type { PrimitiveAnswerProps } from "./types";

// A structures x operations matrix, limited by `archetypes.json` to 2-5 rows and
// 2-3 columns. Width is the constraint, not cell count: a row label like "Leaf
// level contains key values plus row locator" eats half of a 390px screen before
// a single cell is drawn. So each row's label sits on its own line, above its
// cells, and the cells share the full width under sticky column names. Column
// names can be a whole clause too ("Each write copies the entire underlying
// array"), so they wrap within their column, bottom-aligned, never past it.
//
// The limit is checked here as well as when cards are made. It used to live in this
// comment alone, and the first full run wrote 54 cards over it, one of them 5x7.

const COLUMNS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5" };

/** Grid toggle, "Lights": turn on every cell that is true. A row can have more
 *  than one. The ticked set is the answer; tap a lit cell to put it out. */
export function GridToggle({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const rows = card.options?.shape === "grid" ? card.options.rows : [];
  const columns = card.options?.shape === "grid" ? card.options.columns : [];
  const [picked, setPicked] = useState<number[]>([]);

  if (!withinLimit("grid_toggle", "rows", rows.length) || !withinLimit("grid_toggle", "columns", columns.length)) {
    return <NotBuilt />;
  }

  const track = COLUMNS[columns.length] ?? "grid-cols-3";
  const toggle = (cell: number) =>
    setPicked((current) => (current.includes(cell) ? current.filter((item) => item !== cell) : [...current, cell]));

  return (
    <div className="flex flex-col gap-5">
      <Hint>Turn on every cell that is true. A row can have more than one.</Hint>

      <div role="group" aria-label="Answer grid" className="flex flex-col rounded-xl border border-line bg-background px-3.5 pt-1 pb-1.5">
        <div className={`sticky top-0 z-10 grid ${track} border-b border-line bg-background pt-3 pb-2.5`}>
          {columns.map((column) => (
            <span
              key={column}
              className="min-w-0 self-end px-1 text-center font-display text-small leading-head font-semibold text-balance wrap-break-word text-text-2"
            >
              {column}
            </span>
          ))}
        </div>

        {rows.map((structure, row) => (
          <div key={structure} className="flex flex-col gap-0.5 border-b border-line pt-3 pb-1.5 last:border-0">
            <span className="text-body leading-code text-pretty text-text">{structure}</span>
            <div className={`relative grid ${track}`}>
              <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-line" />
              {columns.map((operation, column) => {
                const cell = row * columns.length + column;
                const on = picked.includes(cell);
                return (
                  <button
                    key={operation}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${structure}, ${operation}`}
                    disabled={pending}
                    onClick={() => toggle(cell)}
                    className="relative grid h-12 place-items-center disabled:opacity-60"
                  >
                    <span
                      className={`rounded-full transition-all duration-200 ease-out ${
                        on ? "size-5.5 bg-cyan ring-6 ring-cyan-bg" : "size-3.5 border-2 border-line-2 bg-background"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <CheckBar
        pending={pending}
        busy={busy}
        complete={picked.length > 0}
        onCheck={() => onSubmit({ cardId: card.id, shape: "chosen", picked })}
      />
    </div>
  );
}
