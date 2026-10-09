"use client";

import { type ReactNode, useState } from "react";

/** The rows past the first few, behind "Show all N", which expands in place. The button stays, so focus is kept. */
export function ReviewMore({ total, children }: { total: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && children}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="min-h-11 border-t border-line px-4 py-2.5 text-left text-small font-semibold text-text-2 hover:bg-surface-2"
      >
        {open ? "Show fewer" : `Show all ${total}`}
      </button>
    </>
  );
}
