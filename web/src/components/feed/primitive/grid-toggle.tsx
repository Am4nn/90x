"use client";

import { useState } from "react";
import { PRIMARY } from "@/components/button-styles";
import { NotBuilt } from "./not-built";
import type { PrimitiveAnswerProps } from "./types";

// A structures x operations matrix, capped at 3x3: nine taps is
// already a scroll at 390px, and a 4x4 defeats the card's purpose. `options` is
// `{ rows, columns }`.

const CELL = "grid h-11 min-w-11 place-items-center rounded-lg border text-body font-semibold transition-colors disabled:opacity-60";

/** Grid toggle: tick cells in a structures x operations matrix. The ticked set
 *  is the answer; re-tap a cell to untick it. */
export function GridToggle({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const rows = card.options?.shape === "grid" ? card.options.rows : [];
  const columns = card.options?.shape === "grid" ? card.options.columns : [];
  const [picked, setPicked] = useState<number[]>([]);

  if (rows.length === 0 || columns.length === 0) return <NotBuilt />;

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
