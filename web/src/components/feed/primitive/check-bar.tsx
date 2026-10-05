"use client";

import { createContext, useContext } from "react";
import { Busy } from "@/components/form";
import type { PrimitiveAnswerProps } from "./types";

const BUTTON = "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-body font-bold whitespace-nowrap transition-colors";
/** The card's own Skip, Check and Next buttons: 44px high, 12px radius, bold, as the card design draws them. */
const CARD_SKIP = `${BUTTON} border border-line-2 text-text hover:border-mute disabled:opacity-60`;
export const CARD_NEXT = `${BUTTON} bg-cyan text-on-cyan hover:bg-cyan/90 disabled:opacity-60`;

/** Skip lives in the card; the Check bar shows it beside Check so the two share a row. */
export const SkipContext = createContext<{ pending: boolean; skipping: boolean; skip: () => void } | null>(null);

/** The row every answer ends in: Skip (a third of it) beside Check answer (two thirds).
 *  Check stays grey until the answer is complete. */
export function CheckBar({
  pending,
  busy,
  complete,
  onCheck,
  label = "Check answer",
}: {
  pending: boolean;
  busy: string | null;
  complete: boolean;
  onCheck: () => void;
  label?: string;
}) {
  const skip = useContext(SkipContext);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2 pt-1">
      {skip && (
        <button type="button" disabled={skip.pending} aria-busy={skip.skipping || undefined} onClick={skip.skip} className={CARD_SKIP}>
          <Busy busy={skip.skipping}>{skip.skipping ? "Skipping…" : "Skip"}</Busy>
        </button>
      )}
      <button
        type="button"
        disabled={pending || !complete}
        aria-busy={busy === "check" || undefined}
        onClick={onCheck}
        className={`${CARD_NEXT} disabled:bg-surface-2 disabled:text-mute disabled:opacity-100 ${skip ? "" : "col-span-2"}`}
      >
        <Busy busy={busy === "check"}>{busy === "check" ? "Checking…" : label}</Busy>
      </button>
    </div>
  );
}

/** The Check row for a one-of-many pick: grey until something is selected, then it submits that pick. */
export function ChosenCheckBar({ card, selected, pending, busy, onSubmit }: PrimitiveAnswerProps & { selected: number | null }) {
  return (
    <CheckBar
      pending={pending}
      busy={busy}
      complete={selected !== null}
      onCheck={() => selected !== null && onSubmit({ cardId: card.id, shape: "chosen", picked: [selected] }, selected)}
    />
  );
}
