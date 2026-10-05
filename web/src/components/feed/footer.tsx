"use client";

import Link from "next/link";
import { useState } from "react";
import { rateCardAction } from "@/app/actions/feed";
import { useServerAction } from "@/components/form";
import { nextRating, RATING_LABELS, ratingLabel } from "@/lib/feed/rating";
import type { AnswerResult, CardView } from "@/lib/feed/view";
import { ReportForm } from "./report";

// One class per star, written out so Tailwind sees each.
const STAR_TONE = ["text-rate-1", "text-rate-2", "text-rate-3", "text-rate-4", "text-rate-5"] as const;

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5.5"
      aria-hidden
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
    >
      <path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8L12 3.2z" />
    </svg>
  );
}

/** The card under the card: when it is next due, where to read more, the reader's
 *  star rating and a way to report it. Shown after an answer, never before. */
export function CardFooter({ card, result, nextReview }: { card: CardView; result: AnswerResult; nextReview: string }) {
  const { run, error } = useServerAction({ refresh: false });
  const [stars, setStars] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [report, setReport] = useState<"closed" | "open" | "sent">("closed");

  const lesson = result.sourceRefs.find((ref) => ref.href);
  const source = result.sourceRefs[0];

  const rate = (tapped: number) => {
    const previous = stars;
    const next = nextRating(stars, tapped);
    setStars(next);
    // No disabled state: the star is already lit, and a second tap just re-rates.
    run(() => rateCardAction(card.id, next), { id: "rate", rollback: () => setStars(previous) });
  };

  return (
    <section aria-label="About this card" className="flex flex-col rounded-xl border border-line bg-surface px-5 py-1 font-medium">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line py-1.5">
        <span className="text-small text-text-2">{nextReview}</span>
        {lesson?.href ? (
          <Link href={lesson.href} className="flex min-h-11 items-center gap-1 text-small font-semibold text-cyan">
            {card.topic.name} lesson
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ) : (
          source && <span className="text-small text-mute">Source: {source.title}</span>
        )}
      </div>

      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5">
        <div className="flex items-center gap-2" role="group" aria-label="Rate this card">
          <span className="w-21 shrink-0 text-small text-text-2" aria-live="polite">
            {ratingLabel(stars, hover)}
          </span>
          {RATING_LABELS.map((label, index) => {
            const value = index + 1;
            const lit = value <= (hover ?? stars ?? 0);
            return (
              <button
                key={label}
                type="button"
                aria-label={`${value} of 5, ${label}`}
                aria-pressed={stars === value}
                onClick={() => rate(value)}
                onMouseEnter={() => setHover(value)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(value)}
                onBlur={() => setHover(null)}
                className={`flex h-11 w-9 items-center justify-center ${lit ? STAR_TONE[(hover ?? stars ?? 1) - 1] : "text-mute"}`}
              >
                <Star filled={lit} />
              </button>
            );
          })}
        </div>
        {report === "sent" ? (
          <span className="text-small font-semibold text-mute">Reported</span>
        ) : (
          <button
            type="button"
            onClick={() => setReport((open) => (open === "open" ? "closed" : "open"))}
            aria-expanded={report === "open"}
            className="h-11 text-small font-semibold text-cyan"
          >
            Report
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="pb-3 text-small text-bad">
          {error}
        </p>
      )}
      {report === "open" && <ReportForm cardId={card.id} onSent={() => setReport("sent")} />}
      {report === "sent" && <p className="border-t border-line py-3 text-small text-text-2">Report sent. This card will be reviewed.</p>}
    </section>
  );
}
