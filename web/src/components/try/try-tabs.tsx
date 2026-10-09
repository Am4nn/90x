"use client";

import { useRef } from "react";
import { CheckIcon } from "@/components/icons";
import { useIsPhone } from "@/components/use-is-phone";
import { LISTEN_TAB, TRY_CARDS } from "@/lib/landing/try-cards";
import { tabForKey } from "@/lib/landing/try-state";

const TAB = "relative flex min-h-11 items-center gap-1.5 text-body font-semibold transition-colors motion-reduce:transition-none";

/**
 * The tabs, as text on a rule: System design, DSA, SQL, and on a phone Listen at the right (the wide screen
 * has the lesson beside the card instead). A roving-tabindex tablist: arrows, Home and End, over the tabs showing.
 */
export function TryTabs({ tab, picks, onSelect }: { tab: number; picks: readonly (number | null)[]; onSelect: (index: number) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const phone = useIsPhone();
  function onKeyDown(event: React.KeyboardEvent) {
    const next = tabForKey({ tab }, event.key, phone ? LISTEN_TAB + 1 : LISTEN_TAB);
    if (next === null) return;
    event.preventDefault();
    onSelect(next);
    refs.current[next]?.focus();
  }
  return (
    <div role="tablist" aria-label="Cards and lesson" className="flex gap-5.5 border-b border-line">
      {TRY_CARDS.map((card, i) => {
        const picked = picks[i] ?? null;
        const right = picked === card.correct;
        const selected = i === tab;
        return (
          <button
            key={card.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`try-tab-${card.key}`}
            aria-selected={selected}
            aria-controls="try-panel"
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(i)}
            onKeyDown={onKeyDown}
            className={`${TAB} ${selected ? "text-text" : "text-mute hover:text-text-2"}`}
          >
            <span>
              <span className="@wide:hidden">{card.tabShort}</span>
              <span className="hidden @wide:inline">{card.tab}</span>
            </span>
            {picked !== null && (
              <span role="img" aria-label={right ? "answered correctly" : "answered, not quite"} className="flex">
                <CheckIcon className="size-3 text-mute" aria-hidden />
              </span>
            )}
            {selected && <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-cyan" />}
          </button>
        );
      })}
      <button
        ref={(el) => {
          refs.current[LISTEN_TAB] = el;
        }}
        type="button"
        role="tab"
        id="try-tab-listen"
        data-try-tab="listen"
        aria-selected={tab === LISTEN_TAB}
        aria-controls="try-panel"
        tabIndex={tab === LISTEN_TAB ? 0 : -1}
        onClick={() => onSelect(LISTEN_TAB)}
        onKeyDown={onKeyDown}
        className={`${TAB} ml-auto md:hidden ${tab === LISTEN_TAB ? "text-text" : "text-mute hover:text-text-2"}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="size-4"
        >
          <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
          <rect x="3" y="14" width="5" height="7" rx="2" />
          <rect x="16" y="14" width="5" height="7" rx="2" />
        </svg>
        Listen
        {tab === LISTEN_TAB && <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-cyan" />}
      </button>
    </div>
  );
}
