"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { button } from "@/components/button-styles";
import { Ren } from "@/components/coach/ren";
import { isWeeklyDismissed, type Change } from "@/lib/coach/weekly-rules";
import { band, BAND_TEXT } from "@/lib/tracker/readiness";

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
const NOTICE_MS = 8000;

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
  /** The read, rendered by `Markdown` on the server. */
  children: ReactNode;
};

export function WeeklyRead({ id, weekStart, weekLabel, coachScore, formulaScore, changes, children }: Props) {
  const stored = useSyncExternalStore(subscribe, storedWeek, serverWeek);
  // The click also hides it directly: the store has no subscription, so nothing
  // would re-read localStorage on its own.
  const [dismissedNow, setDismissedNow] = useState(false);
  // Briefly after dismissing: where the card went.
  const [noticeShown, setNoticeShown] = useState(false);
  const shown = stored !== UNCHECKED && !dismissedNow && !isWeeklyDismissed(stored, weekStart);

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, weekStart);
    } catch {
      // Hidden for this session either way; there is nothing else to do.
    }
    setDismissedNow(true);
    setNoticeShown(true);
    setTimeout(() => setNoticeShown(false), NOTICE_MS);
  }

  const delta = coachScore != null && formulaScore != null ? coachScore - formulaScore : null;
  const count = `${changes.length} suggested ${changes.length === 1 ? "change" : "changes"}`;

  if (noticeShown && !shown) {
    return (
      <p
        role="status"
        className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-small text-text-2"
      >
        <span>Coach&apos;s read hidden until next week. You can read it any time in Me.</span>
        <Link href={`/me/weekly/${id}`} className="shrink-0 font-semibold text-cyan">
          Open →
        </Link>
      </p>
    );
  }

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
          {shown && <Ren title="Ren, your coach" size={30} />}
          <div className="flex flex-col gap-0.5">
            <h2 className="font-display text-heading font-semibold">Coach&apos;s read</h2>
            {/* On a phone the week sits under the title; on desktop it moves up
                into the header, beside the dismiss button. */}
            <span className="text-small text-mute md:hidden">Week of {weekLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-small text-mute md:inline">Week of {weekLabel}</span>
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
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="flex flex-col gap-1">
          <span className={`tabular font-display text-dial font-bold ${coachScore == null ? "text-mute" : BAND_TEXT[band(coachScore)]}`}>
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
        {/* The gap pill is inline at the right of the score row on desktop and
            stacked left below it on a phone. */}
        {delta != null && delta !== 0 && (
          <div className="basis-full md:ml-auto md:basis-auto">
            <span className={`tag ${delta > 0 ? "text-ok" : "text-bad"}`}>{delta > 0 ? `+${delta}` : delta} this week</span>
          </div>
        )}
      </div>

      <div className="line-clamp-2 [&>div]:contents">{children}</div>

      <div className="flex flex-col gap-3 border-t border-line pt-4 md:flex-row md:items-center md:justify-between">
        {changes.length > 0 ? (
          <>
            {/* On a phone the footer names the count and where deciding happens;
                on desktop it keeps just the count beside a small button. */}
            <span className="text-small text-mute md:hidden">{count}, decided on the review</span>
            <span className="hidden text-small text-mute md:inline">{count}</span>
          </>
        ) : (
          <span className="text-small text-mute">No suggested changes this week</span>
        )}
        <Link href={`/me/weekly/${id}`} className={`${button({ size: "sm" })} w-full md:w-auto`}>
          Read the full review →
        </Link>
      </div>
    </section>
  );
}
