"use client";

import Link from "next/link";
import { useState } from "react";
import type { CardState, SubCard } from "@/lib/library/topic-list";

// A topic's sub-cards as link chips. On a phone only the first three show,
// then "+N more"; a wide screen shows them all.

const SHOWN_ON_PHONE = 3;

// Mock colours as token mixes: opened text #9FC9D1, border #24424A, chevron #5E8E98;
// the faint chevron #4A5160; the done tick #6FBF8E.
const CHIP: Record<CardState, string> = {
  not_started: "border-line-2 text-text",
  opened:
    "border-[color-mix(in_srgb,var(--color-surface-2)_80%,var(--color-cyan))] text-[color-mix(in_srgb,var(--color-text-2)_70%,var(--color-cyan))]",
  done: "border-line-2 text-text-2",
};
const CHEVRON: Record<CardState, string> = {
  not_started: "text-[color-mix(in_srgb,var(--color-line)_50%,var(--color-mute))]",
  opened: "text-[color-mix(in_srgb,color-mix(in_srgb,var(--color-surface)_65%,var(--color-text))_65%,var(--color-cyan))]",
  done: "text-[color-mix(in_srgb,var(--color-line)_50%,var(--color-mute))]",
};

export function SubCards({ subs }: { subs: SubCard[] }) {
  const [all, setAll] = useState(false);
  const hidden = subs.length - SHOWN_ON_PHONE;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {subs.map((s, i) => (
        <Link
          key={s.slug}
          href={`/library/topic/${s.slug}`}
          className={`h-7.5 max-w-full items-center gap-1.5 rounded-sm border bg-surface pr-2 pl-2.5 text-tag font-semibold hover:border-cyan hover:text-text ${CHIP[s.state]} ${
            !all && i >= SHOWN_ON_PHONE ? "hidden md:flex" : "flex"
          }`}
        >
          {s.state === "done" && (
            <svg viewBox="0 0 16 16" fill="none" aria-hidden className="size-3 shrink-0">
              <path
                d="M3 8.5l3.2 3.2L13 4.8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-[color-mix(in_srgb,color-mix(in_srgb,var(--color-surface)_25%,var(--color-ok))_70%,var(--color-text))]"
              />
            </svg>
          )}
          <span className="min-w-0 truncate">{s.name}</span>
          {s.state !== "not_started" && <span className="sr-only">{s.state === "done" ? ", done" : ", opened"}</span>}
          <svg viewBox="0 0 16 16" fill="none" aria-hidden className={`size-3 shrink-0 ${CHEVRON[s.state]}`}>
            <path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          aria-expanded={all}
          className="h-6.5 cursor-pointer rounded-full px-2.5 text-tag font-semibold text-cyan md:hidden"
        >
          {all ? "Show less" : `+${hidden} more`}
        </button>
      )}
    </div>
  );
}
