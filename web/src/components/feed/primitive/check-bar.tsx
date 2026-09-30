"use client";

import { PRIMARY } from "@/components/button-styles";

/** The footer every mapping/ordering answer shares: a hint on the left and the
 *  Check button on the right. The hint warns (rather than mutes) when the grid
 *  is forcing a judgement the reader has not given yet. */
export function CheckBar({
  pending,
  busy,
  hint,
  warn,
  complete,
  onCheck,
}: {
  pending: boolean;
  busy: string | null;
  hint: string;
  /** Emphasise the hint when the answer is incomplete (the claim grid's "answer every row"). */
  warn?: boolean;
  complete: boolean;
  onCheck: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-small ${!complete && warn ? "text-warn" : "text-mute"}`}>{hint}</span>
      <button
        type="button"
        disabled={pending || !complete}
        aria-busy={busy === "check" || undefined}
        onClick={onCheck}
        className={`w-full md:w-auto ${PRIMARY}`}
      >
        {busy === "check" ? "Checking…" : "Check"}
      </button>
    </div>
  );
}
