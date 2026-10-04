"use client";

import { useState } from "react";
import { CheckBar } from "./check-bar";
import { Hint } from "./hint";
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
  const short = trimmed.length < MIN_CHARS;
  const rubric = card.rubric ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Hint>Write a short answer. The rubric is what the marker checks for.</Hint>

      <div className="flex flex-col gap-3.5">
        {rubric.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3.5">
            <p className="text-tag font-bold tracking-eyebrow text-mute uppercase">Cover these</p>
            <ul className="flex flex-col gap-2">
              {rubric.map((point) => (
                <li key={point} className="border-l border-line-2 pl-3 text-body leading-code text-pretty text-text">
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-3.5">
          <label htmlFor={`compose-${card.id}`} className="sr-only">
            Your answer
          </label>
          <textarea
            id={`compose-${card.id}`}
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, MAX_CHARS))}
            disabled={pending}
            rows={1}
            maxLength={MAX_CHARS}
            autoCapitalize="sentences"
            placeholder="Write your answer"
            className="min-h-35 w-full resize-y rounded-lg border border-line-2 bg-background px-3.5 py-3 text-body text-text placeholder:text-mute focus-visible:border-cyan focus-visible:outline-none disabled:opacity-60"
          />
          <div className="flex items-baseline justify-between gap-3 text-small">
            <span className="text-mute">{short ? `At least ${MIN_CHARS} characters` : ""}</span>
            <span className="tabular font-display text-mute" aria-live="polite">
              {text.length} / {MAX_CHARS}
            </span>
          </div>
        </div>
      </div>

      <CheckBar pending={pending} busy={busy} complete={!short} onCheck={() => onSubmit({ cardId: card.id, answer: trimmed })} />
    </div>
  );
}
