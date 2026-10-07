"use client";

import { Glyph, MarkLine } from "@/components/feed/primitive/marks";
import { ROW_TONE, type RowTone } from "@/components/feed/primitive/option-row";
import { type TryCard as Card, tryVerdict } from "@/lib/landing/try-cards";

const AREA = {
  "topic-sd": "text-topic-sd",
  "topic-dsa": "text-topic-dsa",
  "topic-sql": "text-topic-sql",
} as const;

/** An option's tone, the Feed's own row colours: all idle before an answer; after, the right row green, a wrong pick red, the rest dim. */
function toneOf(index: number, card: Card, picked: number | null): RowTone {
  if (picked === null) return "idle";
  if (index === card.correct) return "ok";
  return index === picked ? "bad" : "dim";
}

/**
 * One sample card, drawn as the Feed draws it: the verdict first once answered, the area and topic,
 * the question (with code), four lettered rows, and after an answer the answer and the key point.
 * Graded here from the card's own data. The verdict's live region is in the page from the start, empty
 * and visually hidden, so a screen reader announces it when it fills. The options use `aria-disabled`,
 * not `disabled`, so focus is not lost when a card is answered.
 */
export function TryCard({
  card,
  picked,
  labelledBy,
  onPick,
  onAgain,
}: {
  card: Card;
  picked: number | null;
  labelledBy: string;
  onPick: (option: number) => void;
  onAgain: () => void;
}) {
  const answered = picked !== null;
  const verdict = answered ? tryVerdict(card, picked) : null;
  return (
    <div
      role="tabpanel"
      id="try-panel"
      aria-labelledby={labelledBy}
      className="flex min-w-0 flex-col gap-5 rounded-2xl border border-line-2 bg-surface p-4 @wide:p-4.5"
    >
      <div
        id="try-verdict"
        aria-live="polite"
        className={answered ? "flex scroll-mt-try-head flex-col gap-1.5 border-b border-line pb-5 motion-safe:animate-try-in" : "sr-only"}
      >
        {verdict && (
          <>
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={`flex size-7 shrink-0 items-center justify-center rounded-full border ${verdict.correct ? "border-ok text-ok" : "border-bad text-bad"}`}
              >
                <Glyph ok={verdict.correct} />
              </span>
              <span className="min-w-0 flex-1 font-display text-title font-semibold tracking-title text-pretty">{verdict.headline}</span>
            </div>
            <span className="text-small text-text-2">{verdict.next}</span>
          </>
        )}
      </div>

      <header className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`flex h-6 flex-none items-center rounded-full border border-line-2 px-2.5 text-tag font-bold ${AREA[card.topicClass]}`}
          >
            {card.area}
          </span>
          <span className="min-w-0 truncate text-small font-semibold">{card.topic}</span>
        </span>
        <span className="flex-none text-tag font-bold tracking-wide text-text-2">{card.difficulty}</span>
      </header>

      <div className="flex flex-col gap-3">
        <p className="text-heading font-semibold text-pretty">{card.prompt}</p>
        {card.code && (
          // Focusable so the keyboard can scroll it (axe: scrollable-region-focusable).
          <pre
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            className="max-w-full overflow-x-auto rounded-xl border border-line bg-surface-2 px-3.5 py-3 font-term text-tag leading-code font-medium whitespace-pre"
          >
            {card.code}
          </pre>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {!answered && <p className="-mt-1.5 text-small text-mute">Pick one.</p>}
        <ul aria-label={answered ? "Your answer" : "Options"} className="m-0 flex list-none flex-col gap-2 p-0">
          {card.options.map((text, i) => {
            const tone = toneOf(i, card, picked);
            const mark = answered && i === card.correct ? "Correct" : answered && i === picked ? "You chose" : null;
            return (
              <li key={text}>
                <button
                  type="button"
                  data-try-option
                  aria-pressed={picked === i}
                  aria-disabled={answered}
                  onClick={() => {
                    if (!answered) onPick(i);
                  }}
                  className={`flex min-h-12 w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left text-body transition-colors motion-reduce:transition-none ${ROW_TONE[tone]} ${answered ? "cursor-default" : "cursor-pointer hover:border-mute-2"}`}
                >
                  <span
                    aria-hidden="true"
                    className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full border border-line-2 text-tag font-bold text-text-2"
                  >
                    {"ABCD"[i]}
                  </span>
                  <span className="flex min-w-0 flex-col gap-2">
                    <span
                      className={`text-pretty wrap-anywhere whitespace-pre-wrap ${card.monoOptions ? "font-term text-small leading-code" : ""}`}
                    >
                      {text}
                    </span>
                    {mark && <MarkLine ok={mark === "Correct"}>{mark}</MarkLine>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {answered && (
        <div className="flex flex-col gap-4 border-t border-line pt-5 motion-safe:animate-try-in">
          <section className="flex flex-col gap-1.5">
            <h2 className="text-tag font-bold tracking-eyebrow text-mute uppercase">Answer</h2>
            <p className="text-body font-medium text-pretty">{card.answer}</p>
          </section>
          <section className="flex flex-col gap-1.5">
            <h2 className="text-tag font-bold tracking-eyebrow text-mute uppercase">Key point</h2>
            <p className="border-l border-line-2 pl-3 text-body font-medium text-pretty">{card.keyPoint}</p>
          </section>
          <div>
            <button
              type="button"
              onClick={onAgain}
              className="h-9 rounded-sm px-1 text-small font-medium text-mute underline decoration-line-2 underline-offset-4 hover:text-text-2"
            >
              Pick again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
