"use client";

import { Suspense, useState } from "react";
import { SignInNotice } from "@/components/landing/sign-in-buttons";
import { useMotionPhase } from "@/components/landing/use-motion";
import { TRY_CARDS, TRY_COPY, tryNextLabel } from "@/lib/landing/try-cards";
import { anyPicked, INITIAL_TRY, pickAgain, pickOption, selectTab } from "@/lib/landing/try-state";
import { TryBar } from "./try-bar";
import { TryCard } from "./try-card";
import { TryTabs } from "./try-tabs";

/**
 * Everything on /try that moves: the tab, the answers, the pinned bar. State is in memory only (a reload starts
 * over) and nothing is sent anywhere. The page's own width (`@wide:`) picks the long or short tab labels.
 */
export function TryClient() {
  const [state, setState] = useState(INITIAL_TRY);
  const phase = useMotionPhase();
  const card = TRY_CARDS[state.tab] ?? TRY_CARDS[0];
  if (!card) return null;
  const picked = state.picks[state.tab] ?? null;
  const bar = anyPicked(state);

  function pick(option: number) {
    if (picked !== null) return;
    setState((s) => pickOption(s, option));
    // The card is tall on a phone and its verdict is at the top: bring it into view.
    requestAnimationFrame(() =>
      document.getElementById("try-verdict")?.scrollIntoView({
        block: "start",
        behavior: phase === "still" ? "auto" : "smooth",
      }),
    );
  }

  function again() {
    setState((s) => pickAgain(s));
    // "Pick again" unmounts with focus on it: put focus back on the card's first option.
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-try-option]")?.focus());
  }

  return (
    <>
      <div className="@container">
        <main className={`mx-auto flex max-w-160 flex-col gap-5 px-4 pt-4 @wide:px-5 ${bar ? "pb-bar" : "pb-14"}`}>
          <h1 className="font-display text-try font-bold tracking-hero">{TRY_COPY.heading}</h1>
          <p className="max-w-try-lede text-heading leading-relaxed font-medium text-text-2">{TRY_COPY.lede}</p>
          <Suspense>
            <SignInNotice spot="hero" />
          </Suspense>
          <TryTabs tab={state.tab} picks={state.picks} onSelect={(index) => setState((s) => selectTab(s, index))} />
          <p className="-mt-2 text-small font-medium text-mute">{TRY_COPY.caption}</p>
          <TryCard card={card} picked={picked} labelledBy={`try-tab-${card.key}`} onPick={pick} onAgain={again} />
        </main>
      </div>
      {bar && <TryBar nextLabel={tryNextLabel(state.tab)} onNext={() => setState((s) => selectTab(s, s.tab + 1))} />}
    </>
  );
}
