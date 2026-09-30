"use client";

import { useState } from "react";
import { CheckBar } from "./check-bar";
import type { PrimitiveAnswerProps } from "./types";

/** Match: tap a left term to arm it, tap a right meaning to lock the pair. A
 *  locked pair unlocks when its term is tapped again. */
export function Match({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const items = card.options?.shape === "match" ? card.options.left : [];
  const targets = card.options?.shape === "match" ? card.options.right : [];
  const [pairs, setPairs] = useState<[number, number][]>([]);
  const [armed, setArmed] = useState<number | null>(null);

  const pairedRight = new Set(pairs.map(([, right]) => right));
  const pairedLeft = new Set(pairs.map(([left]) => left));
  const matchedTo = new Map(pairs.map(([left, right]) => [left, right]));
  const complete = pairs.length === items.length;

  const armLeft = (index: number) => {
    if (pairedLeft.has(index)) {
      setPairs((current) => current.filter(([left]) => left !== index));
      setArmed(index);
      return;
    }
    setArmed((current) => (current === index ? null : index));
  };

  const lockRight = (right: number) => {
    if (armed === null) return;
    const left = armed;
    setPairs((current) => [...current.filter(([l, r]) => l !== left && r !== right), [left, right]]);
    setArmed(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <ul aria-label="Terms" className="flex flex-col gap-2">
          {items.map((item, index) => {
            const locked = pairedLeft.has(index);
            return (
              <li key={index}>
                <button
                  type="button"
                  disabled={pending}
                  aria-pressed={armed === index}
                  aria-label={locked ? `${item} — matched to ${targets[matchedTo.get(index) ?? 0] ?? ""}` : item}
                  onClick={() => armLeft(index)}
                  className={`min-h-11 w-full rounded-xl border px-3 py-2.5 text-left text-body transition-colors disabled:opacity-60 ${
                    armed === index
                      ? "border-cyan bg-cyan-bg text-text"
                      : locked
                        ? "border-line bg-surface-2 text-text"
                        : "border-line-2 bg-surface text-text hover:border-mute"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span>{item}</span>
                    {locked && (
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

        <ul aria-label="Meanings" className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {targets.map((target, index) => (
            <li key={index}>
              <button
                type="button"
                disabled={pending || armed === null}
                onClick={() => lockRight(index)}
                aria-label={target}
                className={`min-h-11 w-full rounded-xl border px-3 py-2.5 text-left text-body transition-colors disabled:opacity-60 ${
                  pairedRight.has(index)
                    ? "border-line bg-surface-2 text-mute"
                    : armed !== null
                      ? "border-cyan bg-surface text-text hover:bg-cyan-bg"
                      : "border-line-2 bg-surface text-text"
                }`}
              >
                {target}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <CheckBar
        pending={pending}
        busy={busy}
        complete={complete}
        hint={complete ? "Ready to check" : `${items.length - pairs.length} pair${items.length - pairs.length === 1 ? "" : "s"} left`}
        onCheck={() => onSubmit({ cardId: card.id, shape: "mapping", pairs })}
      />
    </div>
  );
}
