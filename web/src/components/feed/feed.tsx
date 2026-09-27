"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getNextCard,
  getUpcomingCards,
  type NextCardState,
  saveFeedAreas,
  skipDiagnosticAction,
  startDiagnosticAction,
  submitAnswer,
} from "@/app/actions/feed";
import { EmptyState } from "@/components/empty-state";
import { useServerAction } from "@/components/form";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { useOnline } from "@/components/offline/use-online";
import { PageHeader } from "@/components/page-header";
import { areaDot } from "@/lib/admin/review";
import {
  accuracyPercent,
  AREA_LABEL,
  type AnswerResult,
  type AreaSummary,
  type CardView,
  type EmptyReason,
  type FeedArea,
  FEED_AREAS,
  missionBanner,
  type SessionStats,
  whyLine,
} from "@/lib/feed/view";
import { nextOfflineCard, pendingFor } from "@/lib/offline/outbox";
import { loadCards, outboxItems } from "@/lib/offline/store";
import { refreshCards, sendQueuedAnswers } from "@/lib/offline/sync";
import { FeedCard } from "./card";
import { ReportCard } from "./report";
import { TopicToggle } from "./topic-toggle";

export type Screen =
  | { kind: "offer" }
  | { kind: "card"; card: CardView }
  | { kind: "summary"; summary: AreaSummary[] }
  | { kind: "empty"; reason: EmptyReason };

const PRIMARY = "h-11 rounded-xl bg-cyan px-5 font-semibold text-on-cyan disabled:opacity-60";
const SECONDARY = "h-11 rounded-xl border border-line-2 px-5 font-semibold text-text hover:border-mute disabled:opacity-60";

const EMPTY: Record<EmptyReason, { title: string; body: string }> = {
  no_cards: { title: "No cards yet", body: "Cards are being reviewed. Check back soon." },
  areas_off: { title: "Every topic is off", body: "Turn on at least one topic from the button above to get cards." },
  nothing_left: { title: "Nothing left right now", body: "You're through your reviews and new cards for now. Come back later for more." },
};

/** Offline: the next saved card not yet answered, and how many answers wait to be graded. */
type OfflineView = { card: CardView | null; queued: number };

async function offlineView(userId: string): Promise<OfflineView> {
  const [saved, queued] = await Promise.all([loadCards(userId), outboxItems()]);
  const mine = pendingFor(queued, userId);
  return {
    card: nextOfflineCard(
      saved?.cards ?? [],
      mine.map((item) => item.input.cardId),
    ),
    queued: mine.length,
  };
}

function toScreen(state: Exclude<NextCardState, { error: string }>): Screen {
  return "card" in state ? { kind: "card", card: state.card } : { kind: "empty", reason: state.empty };
}

export function Feed({
  userId,
  initial,
  areas: initialAreas,
  session: initialSession,
}: {
  userId: string;
  initial: Screen;
  areas: FeedArea[];
  session: SessionStats;
}) {
  const online = useOnline();
  const [screen, setScreen] = useState(initial);
  const [offline, setOffline] = useState<OfflineView | null>(null);
  const wasOffline = useRef(false);
  const [areas, setAreas] = useState(initialAreas);
  const [session, setSession] = useState(initialSession);
  const { run: runNext, pending: nextPending, error: nextError } = useServerAction({ refresh: false });
  const topicsSave = useServerAction({ refresh: false });

  const load = useCallback(
    (action: () => Promise<NextCardState>) =>
      runNext(async () => {
        const state = await action();
        if ("error" in state) return state;
        setScreen(toScreen(state));
      }),
    [runNext],
  );

  const showOffline = useCallback(() => offlineView(userId).then(setOffline), [userId]);

  // Offline: serve saved cards. Back online (and on open): send the answers
  // made offline, then ask the server for the card to show, since the one on
  // screen may have been answered offline.
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      void showOffline();
      return;
    }
    let cancelled = false;
    void sendQueuedAnswers(userId, submitAnswer).then((summary) => {
      if (cancelled) return;
      if (summary.session) setSession(summary.session);
      if (wasOffline.current || summary.graded || summary.dropped) load(getNextCard);
      wasOffline.current = false;
      setOffline(null);
      void refreshCards(userId, getUpcomingCards, { topUp: true });
    });
    return () => {
      cancelled = true;
    };
  }, [online, userId, showOffline, load]);

  const onNext = useCallback(
    (result: AnswerResult | null) => {
      if (!result || !online) {
        void showOffline();
        return;
      }
      if (nextPending) return;
      if (result.diagnosticSummary) setScreen({ kind: "summary", summary: result.diagnosticSummary });
      else {
        load(getNextCard);
        void refreshCards(userId, getUpcomingCards, { topUp: true });
      }
    },
    [nextPending, load, online, showOffline, userId],
  );

  const toggle = (area: FeedArea) => {
    const updated = areas.includes(area) ? areas.filter((a) => a !== area) : FEED_AREAS.filter((a) => a === area || areas.includes(a));
    if (!updated.length) return;
    const previous = areas;
    setAreas(updated);
    topicsSave.run(async () => {
      const result = await saveFeedAreas(updated);
      if (result.error) {
        setAreas(previous);
        return result;
      }
      // A card from an area just switched off, or an empty screen, gets a fresh look.
      const stale =
        screen.kind === "empty" || (screen.kind === "card" && !screen.card.diagnostic && !updated.includes(screen.card.topic.area));
      if (stale) load(getNextCard);
    });
  };

  const offlineNow = !online && offline ? offline : null;
  const card = offlineNow ? offlineNow.card : screen.kind === "card" ? screen.card : null;

  return (
    <>
      <PageHeader
        title="Feed"
        action={<TopicToggle areas={areas} pending={topicsSave.pending} error={topicsSave.error} onToggle={toggle} />}
      />

      <OfflineBanner>You&apos;re offline. Answers are saved on this device and graded when you&apos;re back online.</OfflineBanner>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] md:gap-8">
        <div className="flex flex-col gap-4">
          {missionBanner(session) && (
            <div className="flex flex-col gap-3 rounded-xl border border-cyan/40 bg-cyan-bg p-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-semibold">You&apos;ve done {session.answered} cards. Your missions are waiting.</span>
              <Link
                href="/today"
                className="flex h-10 shrink-0 items-center justify-center rounded-xl bg-cyan px-4 text-small font-semibold text-on-cyan"
              >
                Go to Today
              </Link>
            </div>
          )}

          {offlineNow && !offlineNow.card && (
            <EmptyState title={offlineNow.queued ? "No more saved cards" : "No cards saved for offline"}>
              {offlineNow.queued
                ? "You've answered every card saved on this device. They'll be graded when you're back online."
                : "Open the Feed while online and 90x keeps your next cards on this device."}
            </EmptyState>
          )}

          {!offlineNow && screen.kind === "offer" && (
            <DiagnosticOffer
              pending={nextPending}
              error={nextError}
              onStart={() => load(startDiagnosticAction)}
              onSkip={() => load(skipDiagnosticAction)}
            />
          )}

          {!offlineNow && screen.kind === "summary" && (
            <DiagnosticSummary summary={screen.summary} pending={nextPending} error={nextError} onContinue={() => load(getNextCard)} />
          )}

          {!offlineNow && screen.kind === "empty" && (
            <EmptyState title={EMPTY[screen.reason].title}>{EMPTY[screen.reason].body}</EmptyState>
          )}

          {card && (
            <>
              <FeedCard
                key={card.id}
                card={card}
                userId={userId}
                onAnswered={setSession}
                onNext={onNext}
                nextPending={nextPending}
                nextError={nextError}
              />
              <div className="flex items-start justify-between gap-4">
                <span className="text-small text-mute md:hidden">{whyLine(card)}</span>
                <ReportCard key={card.id} cardId={card.id} />
              </div>
            </>
          )}
        </div>

        <aside className="hidden flex-col gap-4 md:flex">
          {card && (
            <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5">
              <h2 className="font-display text-heading font-semibold">Why this card</h2>
              <p className="text-text-2">{whyLine(card)}</p>
            </section>
          )}
          <SessionPanel session={session} />
        </aside>
      </div>
    </>
  );
}

function SessionPanel({ session }: { session: SessionStats }) {
  const accuracy = accuracyPercent(session);
  const tone = accuracy === null ? "text-mute" : accuracy >= 70 ? "text-ok" : accuracy >= 40 ? "text-warn" : "text-bad";
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <h2 className="font-display text-heading font-semibold">Today</h2>
      <dl className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <dt className="text-small text-mute">Answered</dt>
          <dd className="tabular font-display text-title font-bold">{session.answered}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-small text-mute">Correct</dt>
          <dd className={`tabular font-display text-title font-bold ${tone}`}>{accuracy === null ? "—" : `${accuracy}%`}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-small text-mute">Skipped</dt>
          <dd className="tabular font-display text-title font-bold text-text-2">{session.skipped}</dd>
        </div>
      </dl>
    </section>
  );
}

function DiagnosticOffer({
  pending,
  error,
  onStart,
  onSkip,
}: {
  pending: boolean;
  error: string | null;
  onStart: () => void;
  onSkip: () => void;
}) {
  const [pressed, setPressed] = useState<"start" | "skip" | null>(null);
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 md:p-7">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-title font-semibold">Start with a diagnostic</h2>
        <p className="text-text-2">A 15-minute check, 20 cards across your areas. It sets your starting readiness.</p>
      </div>
      <div className="flex gap-2.5">
        <button
          type="button"
          disabled={pending}
          aria-busy={(pending && pressed === "skip") || undefined}
          onClick={() => {
            setPressed("skip");
            onSkip();
          }}
          className={`flex-1 md:flex-none ${SECONDARY}`}
        >
          {pending && pressed === "skip" ? "Skipping…" : "Skip for now"}
        </button>
        <button
          type="button"
          disabled={pending}
          aria-busy={(pending && pressed === "start") || undefined}
          onClick={() => {
            setPressed("start");
            onStart();
          }}
          className={`flex-1 md:flex-none ${PRIMARY}`}
        >
          {pending && pressed === "start" ? "Starting…" : "Start"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
    </section>
  );
}

function DiagnosticSummary({
  summary,
  pending,
  error,
  onContinue,
}: {
  summary: AreaSummary[];
  pending: boolean;
  error: string | null;
  onContinue: () => void;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 md:p-7">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-title font-semibold">Diagnostic done</h2>
        <p className="text-text-2">Your readiness now starts from these answers. The feed leans on the areas you missed.</p>
      </div>
      <ul className="flex flex-col rounded-xl border border-line">
        {summary.map((row) => (
          <li key={row.area} className="flex items-center justify-between gap-3 border-t border-line px-4 py-3.5 first:border-0">
            <span className="flex items-center gap-2 font-semibold">
              <span className={`size-2 rounded-full ${areaDot(row.area)}`} />
              {AREA_LABEL[row.area]}
            </span>
            <span className="tabular text-small text-text-2">
              {row.correct} of {row.answered} correct
            </span>
          </li>
        ))}
      </ul>
      <button type="button" disabled={pending} aria-busy={pending || undefined} onClick={onContinue} className={`md:self-start ${PRIMARY}`}>
        {pending ? "Loading…" : "Continue to your feed"}
      </button>
      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
    </section>
  );
}
