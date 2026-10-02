"use client";

import { useState } from "react";
import { PRIMARY } from "@/components/button-styles";
import type { PrimitiveAnswerProps } from "./types";

// The reader writes their own answer, two or three sentences, and it is marked
// against the card's key points by `gradeWithAi` — the one primitive a pure
// function cannot grade, because the answer is their own words. Behavioural cards
// are the only ones that use it: "tell me about a time you..." has no single right
// answer, and writing it is the exercise.
//
// The cap is a hard limit rather than a suggestion. An unbounded box invites an
// essay, and a per-key-point judgement over an essay stops meaning anything.
const MAX_CHARS = 300;

// Below this the answer cannot have covered three or four separate requirements,
// so the button stays off rather than spending a grade on a fragment.
const MIN_CHARS = 40;

export function Compose({ card, pending, busy, onSubmit }: PrimitiveAnswerProps) {
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const left = MAX_CHARS - text.length;
  const short = trimmed.length < MIN_CHARS;
  const rubric = card.rubric ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`compose-${card.id}`} className="text-small font-semibold text-text-2">
          Your answer{rubric.length ? ` — cover ${rubric.length} things` : ""}
        </label>
        <textarea
          id={`compose-${card.id}`}
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, MAX_CHARS))}
          disabled={pending}
          rows={5}
          maxLength={MAX_CHARS}
          autoCapitalize="sentences"
          placeholder="Two or three sentences."
          className="w-full resize-y rounded-xl border border-line-2 bg-surface-2 px-3.5 py-3 text-body text-text placeholder:text-mute focus-visible:border-cyan focus-visible:outline-none disabled:opacity-60"
        />
        <div className="flex items-baseline justify-between gap-3 text-small">
          <span className="text-mute">{short ? `${MIN_CHARS - trimmed.length} more characters` : "Ready to check"}</span>
          <span className={`tabular ${left <= 40 ? "text-warn" : "text-mute"}`} aria-live="polite">
            {left} left
          </span>
        </div>
      </div>

      {rubric.length > 0 && (
        <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-3">
          <p className="mb-1.5 text-small font-semibold text-text-2">A good answer does all of these</p>
          <ul className="flex flex-col gap-1">
            {rubric.map((point) => (
              <li key={point} className="text-small text-text-2">
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        disabled={pending || short}
        aria-busy={busy === "check" || undefined}
        onClick={() => onSubmit({ cardId: card.id, answer: trimmed })}
        className={PRIMARY}
      >
        {busy === "check" ? "Checking…" : "Check"}
      </button>
    </div>
  );
}
