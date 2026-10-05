"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getNextCard,
  getUpcomingCards,
  type NextCardState,
  saveDifficultyPreference,
  saveFeedAreas,
  skipDiagnosticAction,
  startDiagnosticAction,
  submitAnswer,
} from "@/app/actions/feed";
import { PRIMARY, SECONDARY } from "@/components/button-styles";
import { EmptyState } from "@/components/empty-state";
import { Busy, useServerAction } from "@/components/form";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { useOnline } from "@/components/offline/use-online";
import { PageHeader } from "@/components/page-header";
import { Bar } from "@/components/skeleton";
import { areaDot } from "@/lib/admin/review";
import { type DifficultyPreference } from "@/lib/feed/difficulty";
import {
  AREA_LABEL,
  type AnswerResult,
  type AreaSummary,
  type CardView,
  type EmptyReason,
  type FeedArea,
  type SessionStats,
} from "@/lib/feed/view";
import { nextOfflineCard, pendingFor } from "@/lib/offline/outbox";
import { loadCards, outboxItems } from "@/lib/offline/store";
import { refreshCards, sendQueuedAnswers } from "@/lib/offline/sync";
import { FeedCard } from "./card";
import { FeedFilters } from "./filters";
import { MissionBanner } from "./mission-banner";
import { TodayBlock, WhyBlock } from "./side";

export type Screen =
  | { kind: "offer" }
  | { kind: "card"; card: CardView }
  | { kind: "summary"; summary: AreaSummary[] }
  | { kind: "empty"; reason: EmptyReason };

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
  difficulty: initialDifficulty,
}: {
  userId: string;
  initial: Screen;
  areas: FeedArea[];
  session: SessionStats;
  difficulty: DifficultyPreference;
}) {
  const online = useOnline();
  const [screen, setScreen] = useState(initial);
  // The card the server sent along with the last answer, shown when the reader moves on.
  const preloaded = useRef<Exclude<NextCardState, { error: string }> | null>(null);
  const [offline, setOffline] = useState<OfflineView | null>(null);
  const wasOffline = useRef(false);
  const [areas, setAreas] = useState(initialAreas);
  const [session, setSession] = useState(initialSession);
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const { run: runNext, pending: nextPending, error: nextError } = useServerAction({ refresh: false });
  const topicsSave = useServerAction({ refresh: false });
  const difficultySave = useServerAction({ refresh: false });

  const load = useCallback(
    (action: () => Promise<NextCardState>) =>
      runNext(async () => {
        preloaded.current = null;
        const state = await action();
        if ("error" in state) return state;
        setScreen(toScreen(state));
      }),
    [runNext],
  );

  const showOffline = useCallback(() => offlineView(userId).then(setOffline), [userId]);

  // Offline: serve saved cards. Back online (and on open): send the answers
  // made offline, then ask the server for the card to show. Until then the
  // saved cards stay on screen, since the server's card from before may be
  // one that was just answered offline and would be graded twice.
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      void showOffline();
      return;
    }
    let cancelled = false;
    void (async () => {
      const queued = pendingFor(await outboxItems(), userId).length;
      if (cancelled) return;
      const reload = wasOffline.current || queued > 0;
      if (queued) setOffline(await offlineView(userId));
      const summary = await sendQueuedAnswers(userId, submitAnswer);
      if (cancelled) return;
      if (summary.session) setSession(summary.session);
      wasOffline.current = false;
      void refreshCards(userId, getUpcomingCards, { topUp: true });
      if (!reload) return setOffline(null);
      const state = await getNextCard().catch(() => null);
      if (cancelled) return;
      // No answer from the server: saved cards that are left are still safe to answer; otherwise show the error.
      if (state && !("error" in state)) setScreen(toScreen(state));
      else if ((await offlineView(userId)).card) return;
      else load(getNextCard);
      setOffline(null);
    })();
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
      setOffline(null);
      if (result.diagnosticSummary) setScreen({ kind: "summary", summary: result.diagnosticSummary });
      else {
        // The card that came with the answer, unless the reader has since switched its area off.
        const ready = preloaded.current;
        preloaded.current = null;
        if (ready && ("empty" in ready || ready.card.diagnostic || areas.includes(ready.card.topic.area))) setScreen(toScreen(ready));
        else load(getNextCard);
        void refreshCards(userId, getUpcomingCards, { topUp: true });
      }
    },
    [nextPending, load, online, showOffline, userId, areas],
  );

  /** On to the next card without an answer to show: the one just left could not be graded. */
  const moveOn = useCallback(() => {
    if (nextPending) return;
    setOffline(null);
    load(getNextCard);
    void refreshCards(userId, getUpcomingCards, { topUp: true });
  }, [nextPending, load, userId]);

  const changeAreas = (updated: FeedArea[]) => {
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

  const selectDifficulty = (preference: DifficultyPreference) => {
    const previous = difficulty;
    setDifficulty(preference);
    difficultySave.run(async () => {
      const result = await saveDifficultyPreference(preference);
      if (result.error) {
        setDifficulty(previous);
        return result;
      }
      // The mix changes which cards enter the next refill, never the card on
      // screen, so there is nothing to reload here.
      return result;
    });
  };

  // Set while offline and while reconnecting; cleared once the server's card is back.
  const offlineNow = offline;
  const card = offlineNow ? offlineNow.card : screen.kind === "card" ? screen.card : null;

  return (
    <>
      <PageHeader
        title="Feed"
        action={
          <FeedFilters
            key="filters"
            areas={areas}
            difficulty={difficulty}
            pending={topicsSave.pending || difficultySave.pending}
            error={topicsSave.error ?? difficultySave.error}
            onAreasChange={changeAreas}
            onDifficultyChange={selectDifficulty}
          />
        }
      />

      <OfflineBanner>You&apos;re offline. Answers are saved on this device and graded when you&apos;re back online.</OfflineBanner>

      <div className="-mx-1 grid grid-cols-1 gap-6 md:-mx-2 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-4">
          <MissionBanner session={session} />

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

          {/* Fetching a card the server hasn't preloaded: a card-shaped placeholder takes the
              card's place on the tap. The card stays mounted behind it, so an error finds it as it was. */}
          {card && screen.kind === "card" && !offlineNow && nextPending && <CardSkeleton />}
          {card && (
            <div className={screen.kind === "card" && !offlineNow && nextPending ? "hidden" : "contents"}>
              <FeedCard
                key={card.id}
                card={card}
                userId={userId}
                session={session}
                onAnswered={(next, preload) => {
                  setSession(next);
                  preloaded.current = preload && !("error" in preload) ? preload : null;
                }}
                onNext={onNext}
                onMoveOn={moveOn}
                nextPending={nextPending}
                nextError={nextError}
              />
            </div>
          )}
        </div>

        <aside className="sticky top-8 hidden flex-col gap-4 self-start md:flex">
          {card && <WhyBlock card={card} />}
          <TodayBlock session={session} />
        </aside>
      </div>
    </>
  );
}

/** Stands in for the next card while the server finds it: same frame, same padding. */
function CardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading the next card"
      className="flex animate-pulse flex-col gap-5 rounded-xl border border-line bg-surface p-5 motion-reduce:animate-none"
    >
      <div className="flex items-center justify-between gap-3">
        <Bar w="w-40" h={24} className="rounded-full" />
        <Bar w="w-14" h={12} />
      </div>
      <div className="flex flex-col gap-2.5">
        <Bar h={18} />
        <Bar w="w-5/6" h={18} />
        <Bar w="w-2/3" h={18} />
      </div>
      <Bar h={44} className="rounded-lg" />
      <Bar h={44} className="rounded-lg" />
      <Bar h={44} className="rounded-lg" />
    </div>
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
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 md:p-7">
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
          <Busy busy={pending && pressed === "skip"}>{pending && pressed === "skip" ? "Skipping…" : "Skip for now"}</Busy>
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
          <Busy busy={pending && pressed === "start"}>{pending && pressed === "start" ? "Starting…" : "Start"}</Busy>
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
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 md:p-7">
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
        <Busy busy={pending}>{pending ? "Loading…" : "Continue to your feed"}</Busy>
      </button>
      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
    </section>
  );
}
