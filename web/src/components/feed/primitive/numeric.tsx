"use client";

import { useState } from "react";
import { PRIMARY, SECONDARY } from "@/components/button-styles";
import type { PrimitiveAnswerProps } from "./types";

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// One key shape: a big, tap-friendly digit pad. The running value is the input;
// there is no text field to open a system keyboard.
const KEY =
  "h-12 rounded-xl border border-line-2 bg-surface font-display text-heading font-semibold text-text transition-colors hover:border-mute hover:bg-surface-2 disabled:opacity-60";

/** Numeric entry: a keypad, not a text input. Three taps, nothing to phrase. */
export function Numeric({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const [value, setValue] = useState("");
  const numeric = card.numeric;

  const append = (digit: string) => setValue((v) => (v === "0" ? digit : v + digit));
  const backspace = () => setValue((v) => v.slice(0, -1));
  const decimal = () => setValue((v) => (v.includes(".") ? v : v === "" ? "0." : `${v}.`));
  const sign = () => setValue((v) => (v.startsWith("-") ? v.slice(1) : v === "" ? "-" : `-${v}`));

  const parsed = value === "" || value === "-" ? NaN : Number(value);
  const canSubmit = Number.isFinite(parsed);
  const shown = value === "" ? "–" : value;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-line-2 bg-surface-2 px-4 py-3" aria-live="polite">
        <span className={`tabular block font-display text-display font-bold ${value === "" ? "text-mute" : "text-text"}`}>{shown}</span>
      </div>

      <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Keypad">
        {DIGITS.map((digit) => (
          <button
            key={digit}
            type="button"
            aria-label={String(digit)}
            disabled={pending}
            onClick={() => append(String(digit))}
            className={KEY}
          >
            {digit}
          </button>
        ))}
        {numeric?.negative ? (
          <button type="button" aria-label="Negative" disabled={pending} onClick={sign} className={KEY}>
            −
          </button>
        ) : (
          <span aria-hidden />
        )}
        <button type="button" aria-label="0" disabled={pending} onClick={() => append("0")} className={KEY}>
          0
        </button>
        {numeric?.decimals ? (
          <button type="button" aria-label="Decimal point" disabled={pending} onClick={decimal} className={KEY}>
            .
          </button>
        ) : (
          <span aria-hidden />
        )}
      </div>

      <button type="button" aria-label="Backspace" disabled={pending || value === ""} onClick={backspace} className={`w-full ${SECONDARY}`}>
        ⌫ Delete
      </button>

      <button
        type="button"
        disabled={pending || !canSubmit}
        aria-busy={busy === "check" || undefined}
        onClick={() => onSubmit({ cardId: card.id, shape: "number", value: parsed })}
        className={`w-full ${PRIMARY}`}
      >
        {busy === "check" ? "Checking…" : "Check"}
      </button>
    </div>
  );
}
