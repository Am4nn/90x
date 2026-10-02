"use client";

import { useState } from "react";
import { PRIMARY } from "@/components/button-styles";
import { withinLimit } from "@/lib/feed/archetypes";
import { NotBuilt } from "./not-built";
import type { PrimitiveAnswerProps } from "./types";

// A structures x operations matrix, limited by `archetypes.json` to 2-5 rows and
// 2-3 columns. Width is the constraint, not cell count: a row label like "Leaf
// level contains key values plus row locator" eats half of a 390px screen before
// a single cell is drawn, so a fourth column scrolls sideways while a fifth row
// only scrolls down. `options` is `{ rows, columns }`.
//
// The limit is checked here as well as when cards are made. It used to live in this
// comment alone, and the first full run wrote 54 cards over it, one of them 5x7.

const CELL = "grid h-11 min-w-11 place-items-center rounded-lg border text-body font-semibold transition-colors disabled:opacity-60";

/** Grid toggle: tick cells in a structures x operations matrix. The ticked set
 *  is the answer; re-tap a cell to untick it. */
export function GridToggle({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const rows = card.options?.shape === "grid" ? card.options.rows : [];
  const columns = card.options?.shape === "grid" ? card.options.columns : [];
  const [picked, setPicked] = useState<number[]>([]);

  if (!withinLimit("grid_toggle", "rows", rows.length) || !withinLimit("grid_toggle", "columns", columns.length)) {
    return <NotBuilt />;
  }

  const toggle = (cell: number) =>
    setPicked((current) => (current.includes(cell) ? current.filter((item) => item !== cell) : [...current, cell]));

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1" aria-label="Answer grid">
          <thead>
            <tr>
              <th scope="col" className="sr-only">
                Structure
              </th>
              {columns.map((column) => (
                <th key={column} scope="col" className="pb-1 text-small font-semibold text-text-2">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((structure, row) => (
              <tr key={structure}>
                <th scope="row" className="pr-2 text-right text-small font-semibold text-text-2">
                  {structure}
                </th>
                {columns.map((operation, column) => {
                  const cell = row * columns.length + column;
                  const on = picked.includes(cell);
                  return (
                    <td key={operation}>
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`${structure}, ${operation}`}
                        disabled={pending}
                        onClick={() => toggle(cell)}
                        className={`${CELL} ${on ? "border-cyan bg-cyan-bg text-cyan" : "border-line-2 text-text-2 hover:border-mute hover:text-text"}`}
                      >
                        {on ? "✓" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        disabled={pending || picked.length === 0}
        aria-busy={busy === "check" || undefined}
        onClick={() => onSubmit({ cardId: card.id, shape: "chosen", picked })}
        className={PRIMARY}
      >
        {busy === "check" ? "Checking…" : "Check"}
      </button>
    </div>
  );
}
