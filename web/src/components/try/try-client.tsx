"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { ConsentNote } from "@/components/landing/consent-note";
import { GoogleCta, SignInNotice } from "@/components/landing/sign-in-buttons";
import { useMotionPhase } from "@/components/landing/use-motion";
import { useIsPhone } from "@/components/use-is-phone";
import type { Speed } from "@/lib/audio/rules";
import { LISTEN_TAB, nextTarget, TRY_CARDS, TRY_COPY, TRY_CTA, TRY_TAB_SLUGS, tryNextLabel } from "@/lib/landing/try-cards";
import { INITIAL_TRY, markNudged, markPlayed, pickAgain, pickOption, selectTab, showBar, type TryState } from "@/lib/landing/try-state";
import { bucketSeconds, furthestStep, type TrySpot } from "@/lib/try/steps";
import { DemoPlayer } from "./demo-player";
import { ListenRow } from "./listen-row";
import { TryBar } from "./try-bar";
import { TryCard } from "./try-card";
import { track, trackOnce, visitKinds, watchLeave } from "./try-events";
import { focusLesson, TryLesson } from "./try-lesson";
import { TryTabs } from "./try-tabs";

const slugOf = (index: number) => TRY_TAB_SLUGS[index] ?? "listen";

/**
 * Everything on /try that moves: the tab, the answers, the pinned bar. State is in memory only (a reload starts
 * over). The only thing sent is the anonymous event beacon (try-events.ts). On a phone the lesson is the Listen tab; on a wide screen it sits beside the
 * card, and only one of the two is ever in the page.
 */
export function TryClient() {
  const [state, setState] = useState(INITIAL_TRY);
  // Known only after the first press of play: a 404 from the demo route hides every way to the audio.
  const [audio, setAudio] = useState<"unknown" | "missing">("unknown");
  // The lesson's speed and position last the visit, though a phone's tab change unmounts the player.
  const [rate, setRate] = useState<Speed>(1);
  const listenAt = useRef({ atS: 0 });
  const phase = useMotionPhase();
  const phone = useIsPhone();
  // A wide screen has no Listen tab: if the window grows while it is open, the first card stands in for it.
  const fit = (s: TryState): TryState => (!phone && s.tab === LISTEN_TAB ? selectTab(s, 0) : s);
  const view = fit(state);
  const listening = view.tab === LISTEN_TAB;
  const card = TRY_CARDS[view.tab];
  const picked = view.picks[view.tab] ?? null;
  const bar = showBar(state);
  const behavior = phase === "still" ? "auto" : "smooth";

  // One view per page load (React's dev double-mount runs this twice); the leave watcher goes with the page.
  useEffect(() => {
    trackOnce("view");
    const stop = watchLeave(() => furthestStep(visitKinds()));
    // Every sign-in button carries data-cta: "nav" is the top bar's, the rest are the bar, the card and the nudge.
    const onClick = (e: MouseEvent) => {
      const cta = (e.target as Element).closest?.("[data-cta]")?.getAttribute("data-cta");
      if (cta) track("signin_click", { spot: (cta === "nav" ? "top" : "try") satisfies TrySpot });
    };
    document.addEventListener("click", onClick);
    return () => {
      stop();
      document.removeEventListener("click", onClick);
    };
  }, []);

  function selectTabTracked(index: number) {
    setState((s) => selectTab(s, index));
    if (index !== view.tab) track("tab", { tab: slugOf(index) });
  }

  function pick(option: number) {
    if (picked !== null || !card) return;
    track("answer", {
      card: card.key,
      option,
      correct: option === card.correct,
    });
    setState((s) => pickOption(fit(s), option));
    // The card is tall on a phone and its verdict is under the rows: bring it into view.
    requestAnimationFrame(() => document.getElementById("try-verdict")?.scrollIntoView({ block: "nearest", behavior }));
  }

  function again() {
    setState((s) => pickAgain(fit(s)));
    // "Pick again" unmounts with focus on it: put focus back on the card's first option.
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-try-option]")?.focus());
  }

  // The footer's label and its click share one answer: nextTarget.
  function next() {
    const target = nextTarget(view.tab, view.picks);
    if (target !== LISTEN_TAB) selectTabTracked(target);
    else if (phone) openLesson();
    else focusLesson();
  }

  function openLesson() {
    selectTabTracked(LISTEN_TAB);
    window.scrollTo({ top: 0, behavior });
  }

  const lesson = (
    <TryLesson>
      <DemoPlayer
        onPlayed={() => {
          setState(markPlayed);
          trackOnce("listen_start"); // once per visit: a tab round trip remounts the player, a resume is not a new start
        }}
        onFinished={() => {
          setState(markNudged);
          trackOnce("listen_95");
        }}
        onPaused={(atS) => track("listen_pause", { at: bucketSeconds(atS) })}
        onMissing={() => setAudio("missing")}
        missing={audio === "missing"}
        nudge={state.nudged}
        rate={rate}
        onRate={setRate}
        positionRef={listenAt}
      />
    </TryLesson>
  );

  return (
    <>
      <div className="@container">
        <main className={`mx-auto max-w-160 px-4 pt-4 md:max-w-6xl md:pb-14 @wide:px-5 ${bar && phone ? "pb-bar" : "pb-14"}`}>
          <div className="md:grid md:grid-cols-[minmax(0,1fr)_400px] md:items-start md:gap-10">
            <div className="flex min-w-0 flex-col gap-5">
              <h1 className="font-display text-try font-bold tracking-hero">{TRY_COPY.heading}</h1>
              <p className="max-w-try-lede text-body leading-relaxed text-mute">{TRY_COPY.lede}</p>
              <Suspense>
                <SignInNotice spot="hero" />
              </Suspense>
              <TryTabs tab={view.tab} picks={view.picks} onSelect={selectTabTracked} />
              {phone && listening ? (
                <div role="tabpanel" id="try-panel" aria-labelledby="try-tab-listen">
                  {lesson}
                </div>
              ) : (
                card && (
                  <>
                    <TryCard
                      card={card}
                      picked={picked}
                      labelledBy={`try-tab-${card.key}`}
                      onPick={pick}
                      onAgain={again}
                      nextLabel={tryNextLabel(view.tab, view.picks, phone)}
                      onNext={next}
                    />
                    {audio !== "missing" && <ListenRow onOpen={openLesson} />}
                  </>
                )
              )}
            </div>
            {!phone && (
              <aside className="hidden md:sticky md:top-6 md:flex md:flex-col md:gap-4">
                {lesson}
                {bar && (
                  <div data-try="signin" className="flex flex-col gap-1.5 rounded-2xl border border-line-2 bg-surface p-4">
                    <GoogleCta spot="try" label={TRY_CTA} compact className="w-full" />
                    <ConsentNote className="text-center" />
                    <Suspense>
                      <SignInNotice spot="try" className="text-center" />
                    </Suspense>
                  </div>
                )}
              </aside>
            )}
          </div>
        </main>
      </div>
      {phone && bar && <TryBar />}
    </>
  );
}
