"use client";

import { useEffect, useRef, useState } from "react";
import { CheckBar } from "./check-bar";
import { Hint } from "./hint";
import type { PrimitiveAnswerProps } from "./types";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const MAX_DIGITS = 8;

const KEY =
  "flex h-13 items-center justify-center rounded-lg border border-line bg-surface-2 font-display text-title leading-none font-semibold text-text transition-colors hover:bg-line active:bg-line disabled:opacity-60";

/** What the reader may type, said plainly. */
function rule(decimals: boolean, negative: boolean): string {
  return `${decimals ? "Decimals allowed." : "Whole numbers only."}${negative ? "" : " No minus sign."}`;
}

/** The digits already typed; the sign and the point are not digits. */
const digitCount = (value: string) => value.replace(/[^0-9]/g, "").length;

/** Numeric entry: a keypad, not a text input, and the keyboard works too. */
export function Numeric({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const [value, setValue] = useState("");
  const decimals = Boolean(card.numeric?.decimals);
  const negative = Boolean(card.numeric?.negative);

  const append = (digit: string) =>
    setValue((v) => (digitCount(v) >= MAX_DIGITS ? v : v === "0" ? digit : v === "-0" ? `-${digit}` : v + digit));
  const backspace = () => setValue((v) => v.slice(0, -1));
  const decimal = () =>
    setValue((v) => (!decimals || v.includes(".") || digitCount(v) >= MAX_DIGITS ? v : v === "" || v === "-" ? `${v}0.` : `${v}.`));
  const sign = () => setValue((v) => (!negative ? v : v.startsWith("-") ? v.slice(1) : `-${v}`));

  const parsed = value === "" || value === "-" ? NaN : Number(value);
  const canSubmit = Number.isFinite(parsed);

  // The physical keyboard drives the same handlers; Enter checks.
  const latest = useRef({ append, backspace, decimal, sign, check: () => {} });
  useEffect(() => {
    latest.current = {
      append,
      backspace,
      decimal,
      sign,
      check: () => {
        if (canSubmit && !pending) onSubmit({ cardId: card.id, shape: "number", value: parsed });
      },
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const target = e.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName))) return;
      // A focused button or link keeps Enter for itself (it activates it); digits still type.
      if (e.key === "Enter" && target instanceof HTMLElement && ["BUTTON", "A"].includes(target.tagName)) return;
      const k = latest.current;
      if (/^[0-9]$/.test(e.key)) k.append(e.key);
      else if (e.key === "." || e.key === ",") k.decimal();
      else if (e.key === "-") k.sign();
      else if (e.key === "Backspace") k.backspace();
      else if (e.key === "Enter") k.check();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <Hint>Tap the keypad, or type on a keyboard.</Hint>

      <div className="flex flex-col gap-3">
        <div
          aria-live="polite"
          className={`flex h-18 items-center rounded-xl border bg-background px-4.5 ${value ? "border-cyan" : "border-line-2"}`}
        >
          <span className={`tabular font-display text-display leading-none font-semibold ${value ? "text-text" : "text-mute"}`}>
            {value || "0"}
          </span>
          <span aria-hidden className="ml-0.75 h-7.5 w-0.5 rounded-xs bg-cyan" />
          {decimals && negative && (
            <button
              type="button"
              aria-label="Negative"
              disabled={pending}
              onClick={sign}
              className="ml-4 h-11 w-11 rounded-lg border border-line-2 font-display text-title text-text-2"
            >
              {"±"}
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Keypad">
          {DIGITS.map((digit) => (
            <button key={digit} type="button" aria-label={digit} disabled={pending} onClick={() => append(digit)} className={KEY}>
              {digit}
            </button>
          ))}
          {decimals ? (
            <button type="button" aria-label="Decimal point" disabled={pending} onClick={decimal} className={KEY}>
              .
            </button>
          ) : negative ? (
            <button type="button" aria-label="Negative" disabled={pending} onClick={sign} className={KEY}>
              {"±"}
            </button>
          ) : (
            <span aria-hidden />
          )}
          <button type="button" aria-label="0" disabled={pending} onClick={() => append("0")} className={KEY}>
            0
          </button>
          <button type="button" aria-label="Backspace" disabled={pending || value === ""} onClick={backspace} className={KEY}>
            <svg
              viewBox="0 0 24 24"
              className="size-5.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M21 5H9l-6 7 6 7h12V5zM17 9l-6 6M11 9l6 6" />
            </svg>
          </button>
        </div>

        <p className="text-small text-mute">{rule(decimals, negative)}</p>
      </div>

      <CheckBar
        pending={pending}
        busy={busy}
        complete={canSubmit}
        onCheck={() => onSubmit({ cardId: card.id, shape: "number", value: parsed })}
      />
    </div>
  );
}
