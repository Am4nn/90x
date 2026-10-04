/** A 14px check or cross, drawn so it never depends on a font. */
export function Glyph({ ok, size = "size-3.5" }: { ok: boolean; size?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ok ? <path d="M3 8.5l3.2 3.2L13 4.8" /> : <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />}
    </svg>
  );
}

/** The mark line under a result row: glyph and word, never colour alone. */
export function MarkLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`flex items-center gap-1.5 text-tag font-bold ${ok ? "text-ok" : "text-bad"}`}>
      <Glyph ok={ok} />
      {children}
    </span>
  );
}

/** The six dots that say "this can be dragged". `data-grip` marks it as the handle for a touch drag. */
export function Grip({ className = "text-mute" }: { className?: string }) {
  return (
    <span data-grip className={`flex shrink-0 touch-none items-center justify-center ${className}`} aria-hidden>
      <svg viewBox="0 0 8 12" className="h-3 w-2" fill="currentColor">
        <circle cx="2" cy="2" r="1.1" />
        <circle cx="6" cy="2" r="1.1" />
        <circle cx="2" cy="6" r="1.1" />
        <circle cx="6" cy="6" r="1.1" />
        <circle cx="2" cy="10" r="1.1" />
        <circle cx="6" cy="10" r="1.1" />
      </svg>
    </span>
  );
}

/** The handle on a full-width row: a 32px strip the height of the row, with larger dots than a chip carries. */
export function RowGrip() {
  return (
    <span
      data-grip
      className="-my-2.75 flex w-8 shrink-0 cursor-grab touch-none items-center justify-center self-stretch text-mute"
      aria-hidden
    >
      <svg viewBox="0 0 10 16" className="h-4 w-2.5" fill="currentColor">
        <circle cx="2.5" cy="3" r="1.4" />
        <circle cx="7.5" cy="3" r="1.4" />
        <circle cx="2.5" cy="8" r="1.4" />
        <circle cx="7.5" cy="8" r="1.4" />
        <circle cx="2.5" cy="13" r="1.4" />
        <circle cx="7.5" cy="13" r="1.4" />
      </svg>
    </span>
  );
}
