"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// The Library's track strip. The tabs are links, so each one is its own
// URL and survives a reload. On a phone the strip bleeds to the screen edges and scrolls; a
// faded edge with a round arrow says there is more, and goes away at the end.

export type Track = { key: string; label: string; href: string };

// The design's numbers: one arrow tap moves the strip 160px, and 4px from an end counts as the end.
const SCROLL_STEP = 160;
const EDGE_SLOP = 4;
// The faded edge an arrow sits in (w-21).
const FADE = 84;

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const left = side === "left";
  return (
    // The fade is only decoration; the button inside it is the control.
    <div
      className={`pointer-events-none absolute top-0 bottom-px z-10 flex w-21 items-center md:hidden ${
        left ? "left-0 justify-start bg-linear-to-l/srgb pl-3" : "right-0 justify-end bg-linear-to-r/srgb pr-3"
      } from-transparent to-background to-55%`}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={left ? "Previous tracks" : "More tracks"}
        className="pointer-events-auto grid size-7 place-items-center rounded-full border border-line-2 bg-surface text-text-2"
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden className="size-3">
          <path
            d={left ? "M10 3.5L5.5 8 10 12.5" : "M6 3.5L10.5 8 6 12.5"}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

export function TrackTabs({ tracks, active, count }: { tracks: Track[]; active: string; count: number | null }) {
  const strip = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = strip.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= EDGE_SLOP, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - EDGE_SLOP });
  }, []);

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    // Open with the active tab in view: the last tabs sit past the edge on a phone.
    // Left alone when it is already clear of the faded edges, as in the design.
    const tab = el.querySelector<HTMLElement>("[aria-selected=true]");
    if (tab) {
      const box = el.getBoundingClientRect();
      const r = tab.getBoundingClientRect();
      if (r.left < box.left + FADE || r.right > box.right - FADE) el.scrollLeft += r.left + r.width / 2 - (box.left + box.width / 2);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure]);

  const scrollBy = (dx: number) => strip.current?.scrollBy({ left: dx, behavior: "smooth" });

  return (
    <div className="relative -mx-5 md:mx-0">
      <div
        ref={strip}
        role="tablist"
        aria-label="Library tracks"
        className="flex [scrollbar-width:none] gap-1 overflow-x-auto border-b border-line px-5 md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {tracks.map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              role="tab"
              aria-selected={on}
              className={`relative flex h-11 shrink-0 items-center gap-1.75 px-3 text-body leading-none whitespace-nowrap hover:text-text ${
                on ? "font-bold text-text" : "font-semibold text-mute"
              }`}
            >
              {t.label}
              {on && count != null && <span className="tabular text-tag font-semibold text-mute">{count}</span>}
              {on && (
                <span
                  aria-hidden
                  className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-xs bg-cyan shadow-[0_0_8px_color-mix(in_srgb,var(--color-cyan)_60%,transparent)]"
                />
              )}
            </Link>
          );
        })}
      </div>
      {!edges.start && <Arrow side="left" onClick={() => scrollBy(-SCROLL_STEP)} />}
      {!edges.end && <Arrow side="right" onClick={() => scrollBy(SCROLL_STEP)} />}
    </div>
  );
}
