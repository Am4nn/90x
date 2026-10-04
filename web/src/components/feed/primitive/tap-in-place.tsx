"use client";

import { useState } from "react";
import { codeLanguage } from "@/lib/feed/code";
import { ChosenCheckBar } from "./check-bar";
import { Hint } from "./hint";
import type { PrimitiveAnswerProps } from "./types";

/** The panel's header bar: the language (or "snippet") on the left, the line count on the right. */
export function EditorBar({ promptMd, lineCount }: { promptMd: string; lineCount: number }) {
  return (
    <div className="flex h-9 items-center justify-between border-b border-line px-3.5 font-mono text-tag font-medium text-mute">
      <span>{codeLanguage(promptMd) ?? "snippet"}</span>
      <span>
        {lineCount} {lineCount === 1 ? "line" : "lines"}
      </span>
    </div>
  );
}

/** Tap in place: the reader taps the one correct line in a snippet, then Check
 *  answer. Targets are the card's option lines, never JSX: one option string per
 *  snippet line, and the submitted `picked` is the 0-based line index (the
 *  registry's tap_in_place contract). */
export function TapInPlace({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const lines = card.options?.shape === "list" ? card.options.items : [];
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <Hint>{selected === null ? "Tap a line." : `Line ${selected + 1} picked. Tap another line to change it.`}</Hint>
      <div className="overflow-hidden rounded-lg border border-line bg-background">
        <EditorBar promptMd={card.promptMd} lineCount={lines.length} />
        <ol className="overflow-x-auto py-1.5" aria-label="Options">
          {lines.map((line, index) => {
            const on = selected === index;
            return (
              <li key={index}>
                <button
                  type="button"
                  disabled={pending}
                  aria-pressed={on}
                  aria-label={`Line ${index + 1}: ${line}`}
                  onClick={() => setSelected(index)}
                  className={`relative flex min-h-11 w-max min-w-full items-stretch font-mono text-small transition-colors before:absolute before:inset-y-0 before:left-0 before:w-0.75 disabled:opacity-60 ${
                    on ? "bg-cyan-bg before:bg-cyan" : "before:bg-transparent"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex w-11 shrink-0 items-center justify-end pr-3 text-tag leading-none select-none ${on ? "text-cyan" : "text-mute"}`}
                  >
                    {index + 1}
                  </span>
                  <span className="flex items-center gap-3.5 pr-4">
                    <span className="leading-code whitespace-pre text-text">{line || " "}</span>
                    {on && <span className="font-sans text-tag font-bold tracking-label whitespace-nowrap text-cyan">Your pick</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <ChosenCheckBar card={card} selected={selected} pending={pending} busy={busy} onSubmit={onSubmit} />
    </div>
  );
}
