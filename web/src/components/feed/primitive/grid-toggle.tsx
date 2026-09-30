"use client";

import { useState } from "react";
import { PRIMARY } from "@/components/button-styles";
import { NotBuilt } from "./not-built";
import type { PrimitiveAnswerProps } from "./types";

// The grid is capped at 3x3: nine taps is already a scroll at 390px, and a 4x4
// defeats the card's purpose. `options` is [three structures, three operations].
const SIZE = 3;

const CELL = "grid h-11 min-w-11 place-items-center rounded-lg border text-body font-semibold transition-colors disabled:opacity-60";

/** Grid toggle: tick cells in a structures x operations matrix. The ticked set
 *  is the answer; re-tap a cell to untick it. */
export function GridToggle({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const options = card.options ?? [];
  const structures = options.slice(0, SIZE);
  const operations = options.slice(SIZE, SIZE * 2);
  const [picked, setPicked] = useState<number[]>([]);

  if (structures.length < SIZE || operations.length < SIZE) return <NotBuilt />;

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
              {operations.map((operation) => (
                <th key={operation} scope="col" className="pb-1 text-small font-semibold text-text-2">
                  {operation}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {structures.map((structure, row) => (
              <tr key={structure}>
                <th scope="row" className="pr-2 text-right text-small font-semibold text-text-2">
                  {structure}
                </th>
                {operations.map((operation, column) => {
                  const cell = row * SIZE + column;
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
