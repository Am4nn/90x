"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useOptimistic, useState, useTransition } from "react";
import { button } from "@/components/button-styles";
import { type FormState, FormMessage } from "@/components/form";
import { Markdown } from "@/components/markdown";
import type { BatchStatus, ReviewCard } from "@/lib/admin/cards";
import { areaDot, reviewProgress, type Verdict, weakScores } from "@/lib/admin/review";
import { recordVerdict, undoVerdict } from "../actions";
import { ProgressBar, StatusChip } from "../status-chip";

type Change = { cardId: string; verdict: Verdict | null };

const OUTCOME: Record<"published" | "rejected", string> = {
  published: "Published: this batch's cards are live in the Feed.",
  rejected: "Rejected.",
};

const SCORE_LABEL = { correct: "Correct", clear: "Clear", relevant: "Relevant" } as const;

export function BatchReview({ batchId, status, cards }: { batchId: string; status: BatchStatus; cards: ReviewCard[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<FormState>({});
  const [note, setNote] = useState("");
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      cards.findIndex((c) => c.verdict === null),
    ),
  );
  const [verdicts, apply] = useOptimistic(
    Object.fromEntries(cards.map((c) => [c.id, c.verdict])) as Record<string, Verdict | null>,
    (current, change: Change) => ({ ...current, [change.cardId]: change.verdict }),
  );

  const open = status === "draft";
  const progress = reviewProgress(cards.map((c) => verdicts[c.id] ?? null));
  const card = cards[index];
  const verdict = card ? (verdicts[card.id] ?? null) : null;

  const go = (next: number) => {
    setIndex(Math.min(Math.max(next, 0), cards.length - 1));
    setNote("");
  };

  const run = (change: Change, action: () => Promise<FormState>) => {
    setMessage({});
    startTransition(async () => {
      apply(change);
      try {
        const result = await action();
        setMessage(result);
        if (!result.error) router.refresh();
      } catch {
        setMessage({ error: "That didn't go through. Check your connection and try again." });
      }
    });
  };

  const decide = (choice: Verdict) => {
    if (!card || !open) return;
    const text = choice === "bad" ? note.trim() || undefined : undefined;
    run({ cardId: card.id, verdict: choice }, () => recordVerdict(batchId, card.id, choice, text));
    if (index < cards.length - 1) go(index + 1);
    else setNote("");
  };

  const undo = () => {
    if (!card || !open) return;
    run({ cardId: card.id, verdict: null }, () => undoVerdict(batchId, card.id));
  };

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) return;
    const key = e.key.toLowerCase();
    if (key === "g") decide("good");
    else if (key === "b") decide("bad");
    else if (e.key === "ArrowLeft") go(index - 1);
    else if (e.key === "ArrowRight") go(index + 1);
    else return;
    e.preventDefault();
  });

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="tabular font-semibold text-text">{progress.summary}</span>
          <StatusChip status={status} />
        </div>
        <ProgressBar done={progress.reviewed} total={progress.size} label={progress.summary} />
        <span className="text-small text-mute">
          {open ? `${progress.needed} good of ${progress.size} publishes the batch.` : OUTCOME[status]}
        </span>
      </section>

      {!card ? null : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <article className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-small font-semibold text-text-2">
                  <span className={`size-2 shrink-0 rounded-full ${areaDot(card.domain)}`} />
                  <span className="truncate">{card.topic}</span>
                </span>
                <span className="flex items-center gap-2 text-tag text-mute">
                  <span className="rounded-full border border-line-2 px-2 py-0.5 capitalize">{card.format}</span>
                  {card.difficulty && <span className="rounded-full border border-line-2 px-2 py-0.5 capitalize">{card.difficulty}</span>}
                  {verdict && (
                    <span
                      className={`rounded-full border px-2 py-0.5 ${verdict === "good" ? "border-ok/40 text-ok" : "border-bad/40 text-bad"}`}
                    >
                      {verdict === "good" ? "Good" : "Bad"}
                    </span>
                  )}
                </span>
              </header>

              <div className="text-text">
                <Markdown>{card.promptMd}</Markdown>
              </div>

              {card.options.length > 0 && (
                <ol className="flex list-[upper-alpha] flex-col gap-1.5 pl-5 text-text-2">
                  {card.options.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ol>
              )}

              <div className="flex flex-col gap-2 border-t border-line pt-4">
                <span className="text-tag text-mute uppercase">Answer</span>
                <Markdown>{card.answerMd}</Markdown>
              </div>

              {card.keyPoints.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-tag text-mute uppercase">Key points</span>
                  <ul className="flex list-disc flex-col gap-1.5 pl-5 text-text-2">
                    {card.keyPoints.map((k, i) => (
                      <li key={i}>{k}</li>
                    ))}
                  </ul>
                </div>
              )}

              {card.sources.length > 0 && <span className="text-small text-mute">Source: {card.sources.join(" · ")}</span>}
            </article>

            {open ? (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-small font-semibold text-text-2">Why it&apos;s bad (optional)</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Wrong answer, vague prompt, not an interview question…"
                    className="rounded-xl border border-line-2 bg-surface px-4 py-3 text-text placeholder:text-mute focus:border-cyan focus:outline-none"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => decide("good")}
                    aria-keyshortcuts="G"
                    className={`${button({ variant: "primary", size: "lg" })} flex-1`}
                  >
                    Good
                  </button>
                  <button type="button" onClick={() => decide("bad")} aria-keyshortcuts="B" className={`${button({ size: "lg" })} flex-1`}>
                    Bad
                  </button>
                </div>
              </div>
            ) : null}

            {verdict === "bad" && card.note && <p className="text-small text-mute">Your note: {card.note}</p>}

            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-keyshortcuts="ArrowLeft" className={button()}>
                Prev
              </button>
              <span className="tabular text-small text-mute">
                Card {index + 1} of {cards.length}
              </span>
              <button
                type="button"
                onClick={() => go(index + 1)}
                disabled={index === cards.length - 1}
                aria-keyshortcuts="ArrowRight"
                className={button()}
              >
                Next
              </button>
            </div>
            <div aria-live="polite" className="flex flex-wrap items-center gap-3">
              <FormMessage state={message} />
              {open && verdict && (
                <button type="button" onClick={undo} disabled={pending} className="text-small font-semibold text-cyan disabled:opacity-50">
                  Undo verdict
                </button>
              )}
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <AiReview card={card} />
            <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
              <span className="text-small font-semibold text-text-2">Sample</span>
              <div className="grid grid-cols-10 gap-1.5">
                {cards.map((c, i) => {
                  const v = verdicts[c.id] ?? null;
                  const fill = v === "good" ? "bg-ok" : v === "bad" ? "bg-bad" : "bg-surface-2";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => go(i)}
                      aria-label={`Card ${i + 1}${v ? `, ${v}` : ""}`}
                      aria-current={i === index || undefined}
                      className={`aspect-square rounded-md ${fill} ${i === index ? "ring-2 ring-cyan" : ""}`}
                    />
                  );
                })}
              </div>
              <span className="hidden text-small text-mute lg:block">G good · B bad · ← → move</span>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function AiReview({ card }: { card: ReviewCard }) {
  const quality = card.quality;
  if (!quality)
    return (
      <section className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
        <span className="text-small font-semibold text-text-2">AI review</span>
        <span className="text-small text-mute">No AI review saved for this card.</span>
      </section>
    );
  const weak = weakScores(quality);
  return (
    <section className={`flex flex-col gap-3 rounded-xl border bg-surface p-4 ${weak.length > 0 ? "border-warn/50" : "border-line"}`}>
      <span className="text-small font-semibold text-text-2">AI review</span>
      <dl className="grid grid-cols-3 gap-2">
        {(["correct", "clear", "relevant"] as const).map((k) => (
          <div key={k} className="flex flex-col gap-0.5">
            <dt className="text-tag text-mute">{SCORE_LABEL[k]}</dt>
            <dd className={`tabular font-display text-heading font-semibold ${weak.includes(k) ? "text-warn" : "text-text"}`}>
              {quality[k]}/5
            </dd>
          </div>
        ))}
      </dl>
      {quality.issues && <p className={`text-small ${weak.length > 0 ? "text-warn" : "text-text-2"}`}>{quality.issues}</p>}
    </section>
  );
}
