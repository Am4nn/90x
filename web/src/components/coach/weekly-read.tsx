"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { button } from "@/components/button-styles";
import { Ren } from "@/components/coach/ren";
import { isWeeklyDismissed, type Change } from "@/lib/coach/weekly-rules";
import { DAY_NAMES_LONG } from "@/lib/tracker/dates";
import { band, BAND_TEXT } from "@/lib/tracker/readiness";
import { SLOT_LABEL } from "@/lib/tracker/template";

// The weekly review the Sunday job writes, promoted to a card on Today. The read
// itself is server-rendered and passed in as children, so react-markdown never
// reaches the client bundle; this file only owns the dismiss state and the frame.
//
// Dismissal is per device and keyed by the review's weekStart (see
// isWeeklyDismissed), which is the whole mechanism: next week's review has a new
// weekStart and shows again with no extra bookkeeping. There is no column for it,
// and none is wanted. Every storage access is wrapped because localStorage throws
// in a private window and with site data blocked, and a card that still renders is
// better than a Today that does not.

const DISMISSED_KEY = "90x:weekly-dismissed";

function storedWeek(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

// The server has no localStorage, so it renders the card hidden and React
// re-renders as soon as it can read the device's value. Reading the value in an
// effect and showing the card first would flash a dismissed review into view on
// every load, which is the one thing the dismissal exists to prevent.
const UNCHECKED = "";
const subscribe = () => () => {};
const serverWeek = () => UNCHECKED;

type Props = {
  id: string;
  weekStart: string;
  /** "Sep 21", formatted on the server so both renders agree. */
  weekLabel: string;
  coachScore: number | null;
  formulaScore: number | null;
  changes: Change[];
  /** null means undecided; a decided review still shows its read. */
  accepted: boolean | null;
  /** The read, rendered by `Markdown` on the server. */
  children: ReactNode;
};

export function WeeklyRead({ id, weekStart, weekLabel, coachScore, formulaScore, changes, accepted, children }: Props) {
  const stored = useSyncExternalStore(subscribe, storedWeek, serverWeek);
  // The click also hides it directly: the store has no subscription, so nothing
  // would re-read localStorage on its own.
  const [dismissedNow, setDismissedNow] = useState(false);
  const shown = stored !== UNCHECKED && !dismissedNow && !isWeeklyDismissed(stored, weekStart);

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, weekStart);
    } catch {
      // Hidden for this session either way; there is nothing else to do.
    }
    setDismissedNow(true);
  }

  const delta = coachScore != null && formulaScore != null ? coachScore - formulaScore : null;
  const count = `${changes.length} suggested ${changes.length === 1 ? "change" : "changes"}`;

  return (
    <section
      aria-label="Coach's read"
      className={`${shown ? "flex flex-col" : "hidden"} gap-4 rounded-xl border border-line-2 bg-surface p-5`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Ren defines a fixed gradient id, so a hidden Ren would be the first
              `#ren-lit` in the document and the coach line's mark would lose its
              sphere once this card is dismissed. Render it only while shown. */}
          {shown && <Ren title="Coach" />}
          <div className="flex flex-col gap-0.5">
            <h2 className="font-display text-heading font-semibold">Coach&apos;s read</h2>
            <span className="text-small text-mute">Week of {weekLabel}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss until next week"
          className={button({ variant: "ghost", size: "icon-sm" })}
        >
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>

      <div className="flex items-end gap-6">
        <div className="flex flex-col gap-1">
          <span className={`tabular font-display text-display font-bold ${coachScore == null ? "text-mute" : BAND_TEXT[band(coachScore)]}`}>
            {coachScore ?? "—"}
          </span>
          <span className="text-small text-mute">Coach&apos;s estimate</span>
        </div>
        {formulaScore != null && (
          <div className="flex flex-col gap-1">
            <span className="tabular font-display text-title font-semibold text-text-2">{formulaScore}</span>
            <span className="text-small text-mute">Your dial</span>
          </div>
        )}
      </div>

      {delta != null && delta !== 0 && (
        <span className={`self-start text-small font-semibold ${delta > 0 ? "text-ok" : "text-bad"}`}>
          {delta > 0 ? `+${delta}` : delta} this week
        </span>
      )}

      {children}

      {changes.length > 0 && (
        <ul className="hidden flex-col rounded-xl border border-line bg-surface md:flex">
          {changes.map((c) => (
            <li key={`${c.weekday}-${c.slot}`} className="flex flex-col gap-1 border-t border-line px-4 py-3.5 first:border-0">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">
                  {DAY_NAMES_LONG[c.weekday]} · {SLOT_LABEL[c.slot]}
                </span>
                <span className="tabular font-semibold">
                  <span className="text-mute line-through">{c.from}</span>
                  <span className="text-mute"> → </span>
                  <span className="text-cyan">{c.to}</span>
                </span>
              </div>
              <span className="text-small text-mute">{c.why}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-4 md:flex-row md:items-center md:justify-between">
        {changes.length > 0 ? (
          <>
            <span className="text-small text-mute md:hidden">{count}, decided on the review</span>
            <span className="hidden text-small text-mute md:inline">{count}</span>
          </>
        ) : (
          <span className="text-small text-mute">No suggested changes this week</span>
        )}
        <Link href={`/me/weekly/${id}`} className={`${button({ size: "sm" })} w-full md:w-auto`}>
          {accepted == null && changes.length > 0 ? "Decide" : "Read it"}
        </Link>
      </div>
    </section>
  );
}
