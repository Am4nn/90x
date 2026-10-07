"use client";

import { useRef } from "react";
import { Glyph } from "@/components/feed/primitive/marks";
import { TRY_CARDS } from "@/lib/landing/try-cards";
import { tabForKey } from "@/lib/landing/try-state";

const DOT = {
  "topic-sd": "bg-topic-sd",
  "topic-dsa": "bg-topic-dsa",
  "topic-sql": "bg-topic-sql",
} as const;

/** The three area tabs (System design, DSA, SQL): a roving-tabindex tablist, arrows, Home and End. Phone labels are short. */
export function TryTabs({ tab, picks, onSelect }: { tab: number; picks: readonly (number | null)[]; onSelect: (index: number) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKeyDown(event: React.KeyboardEvent) {
    const next = tabForKey({ tab, picks }, event.key);
    if (next === null) return;
    event.preventDefault();
    onSelect(next);
    refs.current[next]?.focus();
  }
  return (
    <div role="tablist" aria-label="Sample cards" className="grid grid-cols-3 gap-2">
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
            className={`flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-1.5 text-body font-semibold transition-colors motion-reduce:transition-none @wide:gap-2 @wide:px-2 ${
              selected ? "border-cyan bg-cyan-bg text-text" : "border-line-2 text-text-2 hover:text-text"
            }`}
          >
            <span aria-hidden="true" className={`size-1.5 flex-none rounded-full ${DOT[card.topicClass]}`} />
            <span className="min-w-0">
              <span className="@wide:hidden">{card.tabShort}</span>
              <span className="hidden @wide:inline">{card.tab}</span>
            </span>
            {picked !== null && (
              <span
                role="img"
                aria-label={right ? "answered correctly" : "answered, not quite"}
                className={`flex size-4.5 flex-none items-center justify-center rounded-full border ${right ? "border-ok text-ok" : "border-bad text-bad"}`}
              >
                <Glyph ok={right} size="size-2.5" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
