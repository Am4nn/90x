"use client";

import { useSyncExternalStore } from "react";
import { button } from "@/components/button-styles";

// Per-device marks for notices a reader closes or has already seen. A notice
// stores the value it was closed for (a missed day, today's date), so the next
// one with a new value shows again with no bookkeeping. Every storage access is
// wrapped: localStorage throws in a private window and with site data blocked,
// and a notice that still shows beats a page that breaks.

const subscribe = () => () => {};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Saves `value` under `key`; the notice stays hidden for this visit either way. */
export function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nothing else to do: the caller hides the notice in its own state.
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The reader's local date, YYYY-MM-DD. */
export function localDay(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whether `key` holds `value` (today's date when omitted). The server has no
 *  storage and says yes, so a closed notice never flashes in before hydration;
 *  React re-reads the device's value right after. */
export function useRemembered(key: string, value?: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => read(key) === (value ?? localDay()),
    () => true,
  );
}

export function DismissButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className={`${button({ variant: "ghost", size: "icon-sm" })} shrink-0`}>
      <svg
        viewBox="0 0 20 20"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M5 5l10 10M15 5L5 15" />
      </svg>
    </button>
  );
}
