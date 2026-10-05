"use client";

import Form from "next/form";
import { useEffect, useRef, useState } from "react";

// The Library's search button: a 260 x 38 field-shaped button with a ⌘K
// keycap on a wide screen, a 40 x 40 icon on a phone. It opens the same one-field search the
// page always had; ⌘K / Ctrl+K opens it from anywhere on the page.

function SearchIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function LibrarySearch({ area, q, label }: { area: string; q?: string; label: string }) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((o) => !o);
      } else if (event.key === "Escape") {
        // Closing from the field hands focus back to the button, so the keyboard keeps its place.
        if (input.current && document.activeElement === input.current) trigger.current?.focus();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        className="grid size-10 cursor-pointer place-items-center rounded-lg border border-line-2 bg-surface text-text-2 hover:border-[color-mix(in_srgb,var(--color-line-2),var(--color-mute)_23%)] md:flex md:h-9.5 md:w-65 md:cursor-text md:items-center md:gap-2.5 md:pr-2.5 md:pl-3 md:text-mute"
      >
        <SearchIcon className="size-4.25 md:hidden" />
        <SearchIcon className="hidden size-3.75 md:block" />
        <span className="hidden flex-1 text-left text-small font-medium md:inline">{label}</span>
        <span
          className="hidden h-5.5 place-items-center rounded-[6px] border border-line-2 px-1.5 text-tag font-semibold md:grid"
          aria-hidden
        >
          ⌘K
        </span>
      </button>
      {open && (
        <Form action="/library" className="absolute top-full right-0 z-20 mt-2">
          <input type="hidden" name="area" value={area} />
          <input
            ref={input}
            name="q"
            defaultValue={q}
            placeholder={label}
            aria-label={label}
            className="h-10 w-64 rounded-xl border border-line-2 bg-surface px-3.5 text-small text-text outline-none focus:border-cyan"
          />
        </Form>
      )}
    </div>
  );
}
