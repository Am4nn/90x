"use client";

import { useState } from "react";
import { CheckBar } from "./check-bar";
import { Eyebrow, Hint } from "./hint";
import { Grip } from "./marks";
import type { PrimitiveAnswerProps } from "./types";
import { useDrag } from "./use-drag";

const LETTERS = "ABCDEFGH";

/** Match: tap a term to arm it, tap a meaning to lock the pair, or drag the term onto
 *  the meaning. A paired term unpairs when tapped again. Terms are lettered; a meaning
 *  shows the letter of the term paired to it. */
export function Match({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const items = card.options?.shape === "match" ? card.options.left : [];
  const targets = card.options?.shape === "match" ? card.options.right : [];
  const [pairs, setPairs] = useState<[number, number][]>([]);
  const [armed, setArmed] = useState<number | null>(null);

  const pairedLeft = new Set(pairs.map(([left]) => left));
  const ownerOf = new Map(pairs.map(([left, right]) => [right, left]));
  const matchedTo = new Map(pairs.map(([left, right]) => [left, right]));
  const complete = pairs.length === items.length;

  const lock = (left: number, right: number) => {
    setPairs((current) => [...current.filter(([l, r]) => l !== left && r !== right), [left, right]]);
    setArmed(null);
  };

  const { dragging, over, drag } = useDrag({
    onDrop: (source, target) => {
      const left = Number(source.slice(1));
      if (target.startsWith("m")) lock(left, Number(target.slice(1)));
      else if (target === "terms") setPairs((current) => current.filter(([l]) => l !== left));
    },
  });

  const armLeft = (index: number) => {
    if (pairedLeft.has(index)) {
      setPairs((current) => current.filter(([left]) => left !== index));
      setArmed(index);
      return;
    }
    setArmed((current) => (current === index ? null : index));
  };

  const lockRight = (right: number) => {
    if (armed !== null) lock(armed, right);
  };

  return (
    <div className="flex flex-col gap-5">
      <Hint>
        {armed !== null
          ? `Now tap the meaning for ${items[armed] ?? ""}.`
          : "Tap a term, then its meaning, or drag the term onto it. Tap a paired term to undo it."}
      </Hint>

      <div className="flex flex-col gap-2">
        <Eyebrow>Terms</Eyebrow>
        <ul aria-label="Terms" data-drop="terms" className="flex flex-wrap gap-2">
          {items.map((item, index) => {
            const locked = pairedLeft.has(index);
            const on = armed === index;
            return (
              <li key={index}>
                <button
                  type="button"
                  disabled={pending}
                  aria-pressed={on}
                  aria-label={locked ? `${item} — matched to ${targets[matchedTo.get(index) ?? 0] ?? ""}` : item}
                  onClick={() => armLeft(index)}
                  {...drag(`t${index}`)}
                  className={`flex min-h-11 cursor-grab touch-none items-center gap-2.5 rounded-lg border py-2 pr-3 pl-2 text-left text-body leading-chip font-semibold transition-colors select-none disabled:opacity-60 ${
                    dragging === `t${index}` ? "opacity-35" : ""
                  } ${
                    on
                      ? "border-cyan bg-cyan-bg text-text"
                      : locked
                        ? "border-line bg-surface text-mute"
                        : "border-line-2 bg-surface text-text hover:border-mute"
                  }`}
                >
                  <span aria-hidden className="grid size-6.5 shrink-0 place-items-center rounded-sm bg-line text-tag font-bold text-text">
                    {LETTERS[index]}
                  </span>
                  {item}
                  <Grip />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <Eyebrow>Meanings</Eyebrow>
        <ul aria-label="Meanings" className="flex flex-col gap-2">
          {targets.map((target, index) => {
            const owner = ownerOf.get(index);
            const paired = owner !== undefined;
            const hovered = over?.id === `m${index}`;
            return (
              <li key={index}>
                <button
                  type="button"
                  data-drop={`m${index}`}
                  disabled={pending || armed === null}
                  onClick={() => lockRight(index)}
                  aria-label={target}
                  className={`flex min-h-12 w-full items-start gap-3 rounded-lg border py-2.75 pr-3.5 pl-2.5 text-left text-body transition-colors disabled:opacity-100 ${
                    hovered
                      ? "border-cyan bg-cyan-bg text-text"
                      : dragging !== null
                        ? "border-dashed border-cyan bg-surface text-text"
                        : paired
                          ? "border-cyan bg-cyan-bg text-text"
                          : armed !== null
                            ? "border-dashed border-cyan bg-surface text-text hover:bg-cyan-bg"
                            : "border-line-2 bg-surface text-text"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`grid size-6.5 shrink-0 place-items-center rounded-sm border text-tag font-bold ${
                      paired ? "border-cyan bg-background text-cyan" : "border-dashed border-line-2 text-mute"
                    }`}
                  >
                    {paired ? LETTERS[owner] : ""}
                  </span>
                  <span className="text-pretty">{target}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <CheckBar pending={pending} busy={busy} complete={complete} onCheck={() => onSubmit({ cardId: card.id, shape: "mapping", pairs })} />
    </div>
  );
}
