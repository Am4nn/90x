"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { submitAnswer } from "@/app/actions/feed";
import { useServerAction } from "@/components/form";
import { Markdown } from "@/components/markdown";
import { areaDot } from "@/lib/admin/review";
import { type AnswerInput, type AnswerResult, type CardView, nextReviewText, scoreLine, type SessionStats } from "@/lib/feed/view";

type Phase = { kind: "ask" } | { kind: "self_mark" } | { kind: "result"; result: AnswerResult; choice: number | null; nextReview: string };

const PRIMARY = "h-11 rounded-xl bg-cyan px-5 font-semibold text-on-cyan disabled:opacity-60";
const SECONDARY = "h-11 rounded-xl border border-line-2 px-5 font-semibold text-text hover:border-mute disabled:opacity-60";
const OUTCOME_TEXT = { correct: "text-ok", wrong: "text-bad", skipped: "text-mute" } as const;

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "BUTTON", "A"].includes(target.tagName));

/**
 * One card from question to result. Keyed by card id, so every card starts
 * fresh. The question stays put while the answer area turns into the result.
 */
export function FeedCard({
  card,
  onAnswered,
  onNext,
  nextPending,
  nextError,
}: {
  card: CardView;
  onAnswered: (session: SessionStats) => void;
  onNext: (result: AnswerResult) => void;
  nextPending: boolean;
  nextError: string | null;
}) {
  const { run, pending, error } = useServerAction({ refresh: false });
  const [phase, setPhase] = useState<Phase>({ kind: "ask" });
  const [answer, setAnswer] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [busy, setBusy] = useState<"check" | "skip" | "option" | "self" | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const submit = (label: NonNullable<typeof busy>, input: AnswerInput, choice: number | null = null) => {
    setBusy(label);
    run(async () => {
      const state = await submitAnswer(input);
      if ("error" in state) return state;
      if ("needsSelfMark" in state) {
        setPhase({ kind: "self_mark" });
        return;
      }
      onAnswered(state.session);
      setPhase({ kind: "result", result: state.result, choice, nextReview: nextReviewText(state.result.nextDue, new Date()) });
    });
  };
  const check = () => {
    if (answer.trim() && !pending) submit("check", { cardId: card.id, answer });
  };

  const result = phase.kind === "result" ? phase.result : null;

  useEffect(() => {
    if (result) nextRef.current?.focus({ preventScroll: true });
  }, [result]);

  // Enter on the result goes to the next card (desktop), unless focus is in a field or on a control.
  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.isComposing || isTyping(e.target)) return;
      e.preventDefault();
      onNext(result);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, onNext]);

  const label = busy && pending ? busy : null;

  return (
    <article className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5 md:p-7">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-tag font-bold text-text-2">
            <span className={`size-2 shrink-0 rounded-full ${areaDot(card.topic.area)}`} />
            <span className="truncate">
              {card.topic.name}
              {card.difficulty && ` · ${card.difficulty}`}
            </span>
          </span>
          {card.diagnostic && (
            <span className="tabular shrink-0 text-small text-mute">
              Diagnostic {card.diagnostic.index} of {card.diagnostic.total}
            </span>
          )}
        </div>
        {card.diagnostic && (
          <div className="h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="h-full rounded-full bg-cyan" style={{ width: `${(card.diagnostic.index / card.diagnostic.total) * 100}%` }} />
          </div>
        )}
      </header>

      <div className="font-display text-heading font-semibold [&_p]:text-text">
        <Markdown>{card.promptMd}</Markdown>
      </div>

      {phase.kind === "ask" && !showOptions && (
        <div className="flex flex-col gap-3">
          <label className="sr-only" htmlFor={`answer-${card.id}`}>
            Your answer
          </label>
          <textarea
            id={`answer-${card.id}`}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                check();
              }
            }}
            maxLength={4000}
            rows={4}
            placeholder="Type your answer"
            className="w-full resize-y rounded-xl border border-line-2 bg-surface-2 px-4 py-3 text-text placeholder:text-mute focus:border-cyan focus:outline-none"
          />
          {card.options && (
            <button
              type="button"
              onClick={() => setShowOptions(true)}
              className="self-start text-small font-semibold text-cyan underline-offset-2 hover:underline"
            >
              Show options
            </button>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="hidden text-small text-mute md:inline">Ctrl or ⌘ + Enter to check</span>
            <div className="flex flex-1 gap-2.5 md:flex-none">
              <button
                type="button"
                disabled={pending}
                aria-busy={label === "skip" || undefined}
                onClick={() => submit("skip", { cardId: card.id, skipped: true })}
                className={`flex-1 md:flex-none ${SECONDARY}`}
              >
                {label === "skip" ? "Skipping…" : "Skip"}
              </button>
              <button
                type="button"
                disabled={pending || !answer.trim()}
                aria-busy={label === "check" || undefined}
                onClick={check}
                className={`flex-1 md:flex-none ${PRIMARY}`}
              >
                {label === "check" ? "Checking…" : "Check"}
              </button>
            </div>
          </div>
        </div>
      )}

      {phase.kind === "ask" && showOptions && card.options && (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2" aria-label="Options">
            {card.options.map((option, index) => (
              <li key={index}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => submit("option", { cardId: card.id, choice: index }, index)}
                  className="flex w-full items-start gap-3 rounded-xl border border-line-2 px-4 py-3 text-left text-text hover:border-cyan disabled:opacity-60"
                >
                  <span className="font-display font-semibold text-mute">{String.fromCharCode(65 + index)}</span>
                  <span>{option}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => setShowOptions(false)} className="text-small font-semibold text-mute hover:text-text-2">
              Type it instead
            </button>
            {label === "option" && <span className="text-small text-mute">Checking…</span>}
          </div>
        </div>
      )}

      {phase.kind === "self_mark" && (
        <div className="flex flex-col gap-3 rounded-xl border border-warn/40 p-4">
          <span className="font-semibold">Grading is unavailable right now. Did you get it?</span>
          <div className="flex gap-2.5">
            <button
              type="button"
              disabled={pending}
              aria-busy={label === "self" || undefined}
              onClick={() => submit("self", { cardId: card.id, selfMark: "missed", answer })}
              className={`flex-1 ${SECONDARY}`}
            >
              Missed it
            </button>
            <button
              type="button"
              disabled={pending}
              aria-busy={label === "self" || undefined}
              onClick={() => submit("self", { cardId: card.id, selfMark: "got", answer })}
              className={`flex-1 ${PRIMARY}`}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {phase.kind === "result" && (
        <Result
          result={phase.result}
          answer={answer}
          choice={phase.choice}
          nextReview={phase.nextReview}
          onNext={() => onNext(phase.result)}
          nextPending={nextPending}
          nextRef={nextRef}
        />
      )}

      {(error ?? (phase.kind === "result" ? nextError : null)) && (
        <p role="alert" className="text-small text-bad">
          {error ?? nextError}
        </p>
      )}
    </article>
  );
}

function Result({
  result,
  answer,
  choice,
  nextReview,
  onNext,
  nextPending,
  nextRef,
}: {
  result: AnswerResult;
  answer: string;
  choice: number | null;
  nextReview: string;
  onNext: () => void;
  nextPending: boolean;
  nextRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const typed = choice === null && answer.trim() && result.outcome !== "skipped";
  return (
    <div className="flex flex-col gap-5">
      {typed && <div className="rounded-xl border border-line-2 px-4 py-3 whitespace-pre-wrap text-text-2">{answer}</div>}

      <div className="flex items-baseline gap-3" aria-live="polite">
        {result.outcome !== "skipped" && (
          <span className={`tabular font-display text-display font-bold ${OUTCOME_TEXT[result.outcome]}`}>
            {Math.round(result.score * 100)}%
          </span>
        )}
        <span className={result.outcome === "skipped" ? "font-semibold text-text-2" : "text-small text-mute"}>{scoreLine(result)}</span>
      </div>

      {result.options && (
        <ul className="flex flex-col gap-2" aria-label="Options">
          {result.options.map((option, index) => {
            const correct = index === result.correctOption;
            const picked = index === choice;
            return (
              <li
                key={index}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${correct ? "border-ok/50 text-text" : picked ? "border-bad/50 text-text-2" : "border-line text-mute"}`}
              >
                <span className={`font-display font-semibold ${correct ? "text-ok" : picked ? "text-bad" : ""}`}>
                  {correct ? "✓" : picked ? "✕" : String.fromCharCode(65 + index)}
                </span>
                <span>{option}</span>
              </li>
            );
          })}
        </ul>
      )}

      {result.keyPoints.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-small font-semibold text-mute">Key points</h2>
          <ul className="flex flex-col gap-2.5">
            {result.keyPoints.map((point, index) => {
              const hit = result.pointsHit?.[index];
              return (
                <li key={index} className="grid grid-cols-[20px_1fr] gap-2.5">
                  {hit === undefined ? (
                    <span className="text-mute" aria-hidden>
                      •
                    </span>
                  ) : (
                    <span className={hit ? "text-ok" : "text-bad"} aria-label={hit ? "Covered" : "Missed"}>
                      {hit ? "✓" : "✕"}
                    </span>
                  )}
                  <span className={hit === false ? "text-text-2" : "text-text"}>{point}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2.5">
        <h2 className="text-small font-semibold text-mute">Answer</h2>
        <Markdown>{result.answerMd}</Markdown>
      </section>

      {result.sourceRefs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {result.sourceRefs.map((source, index) =>
            source.href ? (
              <Link
                key={index}
                href={source.href}
                className="rounded-full border border-line-2 px-3 py-2 text-small font-semibold text-text-2 hover:text-text"
              >
                {source.title}
              </Link>
            ) : (
              <span key={index} className="rounded-full border border-line-2 px-3 py-2 text-small font-semibold text-text-2">
                {source.title}
              </span>
            ),
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <span className="text-small text-mute">{nextReview}</span>
        <button
          ref={nextRef}
          type="button"
          disabled={nextPending}
          aria-busy={nextPending || undefined}
          onClick={onNext}
          className={`w-full md:w-auto ${PRIMARY}`}
        >
          {nextPending ? "Loading…" : result.diagnosticSummary ? "See your results" : "Next card"}
        </button>
      </div>
    </div>
  );
}
