"use client";

import { useState } from "react";
import { dropIndex, refill } from "@/lib/feed/drag";
import { CheckBar } from "./check-bar";
import { Hint } from "./hint";
import { Grip } from "./marks";
import type { PrimitiveAnswerProps } from "./types";
import { useDrag } from "./use-drag";

const CODE = "font-mono text-body leading-chip";
const PROSE = "text-body leading-chip";

/** Pieces that are code (a symbol, a keyword in capitals) read in monospace; sentence fragments do not. */
const looksLikeCode = (tokens: string[]) => tokens.some((token) => /[;(){}[\]=<>*+/\\.,_]|^[A-Z]{2,}$/.test(token));

/** Code-shaped archetypes read in monospace; clause and definition fills read as prose. An unrecognised archetype falls back on the pieces' look. */
export const tokenFont = (archetype: string | null, tokens: string[]) =>
  archetype === "fill-code-blank" || archetype === "fill-signature"
    ? CODE
    : archetype === "fill-definition" || archetype === "fill-clause"
      ? PROSE
      : looksLikeCode(tokens)
        ? CODE
        : PROSE;

/** Assemble: tap pieces from the pool into the line, left to right, or drag them into place.
 *  Pre-filled pieces (a word-bank template) stay put in grey; only the gaps are asked for. */
export function Assemble({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const tokens = card.options?.shape === "assemble" ? card.options.tokens : [];
  const fixed = card.options?.shape === "assemble" ? card.options.fixed : tokens.map(() => null);

  const [slots, setSlots] = useState<(number | null)[]>(() => tokens.map((_, i) => fixed[i] ?? null));

  const gaps = tokens.map((_, i) => i).filter((i) => fixed[i] === null);
  const inPool = (index: number) => slots.every((slot) => slot !== index);
  const pool = gaps.filter(inPool);
  const nextGap = gaps.find((slot) => slots[slot] === null);
  const complete = slots.every((slot) => slot !== null);
  const templated = fixed.some((f) => f !== null);
  const TOKEN = tokenFont(card.archetype, tokens);

  const place = (index: number) => {
    if (nextGap === undefined) return;
    setSlots((current) => current.map((slot, i) => (i === nextGap ? index : slot)));
  };

  const remove = (slot: number) => {
    setSlots((current) => current.map((value, i) => (i === slot ? null : value)));
  };

  const { dragging, over, drag } = useDrag({
    onDrop: (source, target, side) => {
      const token = source.startsWith("p") ? Number(source.slice(1)) : slots[Number(source.slice(1))];
      if (token === null || token === undefined) return;
      if (target === "pool") return setSlots((current) => refill(gaps, current, token, null));
      if (!target.startsWith("g")) return;
      const slot = Number(target.slice(1));
      const position = gaps.indexOf(slot);
      if (position === -1) return;
      const sequence = gaps.flatMap((g) => (slots[g] === null || slots[g] === undefined ? [] : [slots[g] as number]));
      let at = dropIndex(position, side, slots[slot] !== null);
      const from = sequence.indexOf(token);
      if (from !== -1 && from < at) at -= 1;
      setSlots((current) => refill(gaps, current, token, at));
    },
  });

  const dim = (id: string) => (dragging === id ? "opacity-35" : "");

  return (
    <div className="flex flex-col gap-5">
      <Hint>
        {templated
          ? "Tap pieces to fill the blanks in order, or drag them into place. Grey parts are fixed. Tap a placed piece to take it back."
          : "Tap pieces to build the line in order, or drag them into place. Tap a placed piece to take it back."}
      </Hint>

      <div className="flex flex-col gap-4">
        <div
          className="flex min-h-17 flex-wrap items-center gap-2 rounded-lg border border-line bg-background p-3"
          aria-label="Your answer"
        >
          {slots.map((placed, slot) => {
            const pre = fixed[slot] ?? null;
            if (pre !== null) {
              return (
                <span key={slot} className={`flex min-h-11 items-center rounded-md bg-surface-2 px-3 text-text-2 ${TOKEN}`}>
                  {tokens[pre]}
                </span>
              );
            }
            const target = over?.id === `g${slot}` ? over : null;
            const bar =
              target && placed !== null
                ? target.side === "before"
                  ? "shadow-[-6px_0_0_0_var(--color-cyan)]"
                  : "shadow-[6px_0_0_0_var(--color-cyan)]"
                : "";
            if (placed === null) {
              return (
                <span
                  key={slot}
                  data-drop={`g${slot}`}
                  data-axis="x"
                  aria-hidden
                  className={`h-11 w-13 rounded-md border ${
                    target ? "border-cyan bg-cyan-bg" : dragging !== null ? "border-dashed border-cyan" : "border-dashed border-line-2"
                  }`}
                />
              );
            }
            return (
              <button
                key={slot}
                type="button"
                data-drop={`g${slot}`}
                data-axis="x"
                disabled={pending}
                onClick={() => remove(slot)}
                aria-label={`Remove ${tokens[placed]} from the answer`}
                {...drag(`s${slot}`)}
                className={`flex min-h-11 cursor-grab touch-none items-center gap-2 rounded-md border border-cyan bg-cyan-bg pr-2.5 pl-3 text-text select-none disabled:opacity-60 ${TOKEN} ${dim(`s${slot}`)} ${bar}`}
              >
                {tokens[placed]}
                <Grip />
              </button>
            );
          })}
        </div>

        {(pool.length > 0 || dragging !== null) && (
          <ul
            aria-label="Tokens"
            data-drop="pool"
            className={`-m-2 flex min-h-15 flex-wrap gap-2 rounded-xl border p-2 ${
              over?.id === "pool"
                ? "border-cyan bg-cyan-bg"
                : dragging?.startsWith("s")
                  ? "border-dashed border-cyan"
                  : "border-transparent"
            }`}
          >
            {pool.map((index) => (
              <li key={index}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => place(index)}
                  {...drag(`p${index}`)}
                  className={`flex min-h-11 min-w-11 cursor-grab touch-none items-center gap-2 rounded-md border border-line-2 bg-surface pr-2.5 pl-3.5 text-text transition-colors select-none hover:border-mute disabled:opacity-60 ${TOKEN} ${dim(`p${index}`)}`}
                >
                  {tokens[index]}
                  <Grip />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CheckBar
        pending={pending}
        busy={busy}
        complete={complete}
        onCheck={() => onSubmit({ cardId: card.id, shape: "ordered", order: slots.map((placed) => placed ?? 0) })}
      />
    </div>
  );
}
