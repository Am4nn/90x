"use client";

import type { ReactNode } from "react";
import { TRY_LESSON } from "@/lib/landing/try-cards";

const TITLE_ID = "try-lesson-title";

/** Moves focus to the lesson's heading: where "Hear the lesson" goes on a wide screen. */
export function focusLesson() {
  document.getElementById(TITLE_ID)?.focus();
}

/**
 * The lesson: its title and line, the player slot (children), and the opening lines. One of these is in the page at a time.
 * Once the player is open its transcript carries the whole lesson, so the opening steps aside.
 */
export function TryLesson({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby={TITLE_ID} className="group flex flex-col gap-3.5 rounded-2xl border border-line-2 bg-surface p-4">
      <div className="flex items-center gap-2">
        <span className="tag text-topic-ai">AI</span>
        <span className="text-small font-semibold text-text-2">Lesson</span>
      </div>
      <h2 id={TITLE_ID} tabIndex={-1} className="font-display text-title font-semibold tracking-title">
        {TRY_LESSON.title}
      </h2>
      <p className="text-body text-text-2">{TRY_LESSON.line}</p>
      {children}
      <p className="text-body leading-relaxed text-text-2 group-has-[[data-try=player]]:hidden">{TRY_LESSON.opening.join(" ")}</p>
      <p className="text-small text-mute group-has-[[data-try=player]]:hidden">
        One of {TRY_LESSON.count} lessons. Read on, or press play.
      </p>
    </section>
  );
}
