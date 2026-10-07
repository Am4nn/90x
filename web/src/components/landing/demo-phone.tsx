"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_PHONE_TITLE } from "@/lib/landing/copy";
import { DEMO_ANSWER, DEMO_CHOICES, DEMO_QUESTION } from "@/lib/landing/demo";
import { PHONE_STRIP_SQUARES, type PhoneDemoView, phoneDemoView, restartTick, STEP_LABELS, STEP_MS } from "@/lib/landing/demo-timer";
import { FIRST_CORRECT_DAYS } from "@/lib/landing/review-days";
import { PHONE_PAGE } from "./phone-page";
import { useMotionPhase } from "./use-motion";

/** A choice's look: idle, tapped (cyan), then marked (green if right, red if wrong, and the right one green when a wrong one was tapped). */
function tone(index: number, view: PhoneDemoView): string {
  const mine = index === view.tapped;
  if (!mine && !(view.marked && index === DEMO_ANSWER)) return "border-line-2 text-text-2";
  if (!view.marked) return "border-cyan bg-cyan-bg text-cyan";
  if (mine) return view.outcome === "right" ? "border-ok bg-ok/8 text-ok" : "border-bad bg-bad/8 text-bad";
  return "border-ok text-ok";
}

/**
 * Page two on a phone: one Feed card that taps, marks and books itself, looping, with a three-step
 * progress strip above it whose active segment fills over the step's four seconds. It runs only while
 * its page is the one on screen and starts at the beginning of a card each time. The card is an
 * illustration: screen readers get one sentence, not a card that changes every four seconds.
 * Under reduced motion it is the finished state and nothing runs.
 */
export function DemoPhone() {
  const phase = useMotionPhase();
  const page = useRef<HTMLElement>(null);
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const element = page.current;
    if (phase !== "live" || !element) return;
    let timer = 0;
    const watch = new IntersectionObserver(
      ([entry]) => {
        window.clearInterval(timer);
        setRunning(false);
        // A page that is leaving (ratio just under 0.6) is not arriving.
        if (!entry?.isIntersecting || entry.intersectionRatio < 0.6) return;
        setTick(restartTick);
        setRunning(true);
        timer = window.setInterval(() => setTick((t) => t + 1), STEP_MS);
      },
      { threshold: [0, 0.6] },
    );
    watch.observe(element);
    return () => {
      watch.disconnect();
      window.clearInterval(timer);
    };
  }, [phase]);

  const reduced = phase === "still";
  const view = phoneDemoView(tick, reduced, running);
  return (
    <section
      ref={page}
      data-landing="demo-phone"
      data-page="demo"
      data-running={running}
      aria-labelledby="demo-phone-h"
      className={PHONE_PAGE}
    >
      <h2 id="demo-phone-h" className="flex-none font-display text-page font-bold tracking-hero">
        {DEMO_PHONE_TITLE}
      </h2>
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-6">
        <ol aria-label="What the demo shows" className="m-0 grid list-none grid-cols-3 gap-2 p-0">
          {STEP_LABELS.map((label, i) => {
            const state = view.segments[i];
            return (
              <li key={label} aria-current={state === "active" ? "step" : undefined} className="flex min-w-0 flex-col gap-2">
                <span aria-hidden="true" className="relative block h-0.75">
                  <span className="absolute inset-x-0 top-px h-px bg-line-2" />
                  {/* The key restarts the fill each step. Done: full. Waiting: empty. */}
                  <span
                    key={state === "active" ? `a${tick}` : state}
                    className={`relative block h-0.75 origin-left rounded-full bg-cyan ${
                      state === "active" ? "animate-demo-fill motion-reduce:animate-none" : state === "done" ? "" : "scale-x-0"
                    }`}
                  />
                </span>
                <span
                  className={`text-tag leading-snug font-semibold text-balance transition-colors motion-reduce:transition-none ${
                    state === "active" ? "text-text" : state === "done" ? "text-text-2" : "text-mute"
                  }`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="sr-only">
          Example. You tap Backoff with jitter, Ren marks it Correct, and the next review is booked {FIRST_CORRECT_DAYS} days out.
        </p>
        <div
          aria-hidden="true"
          data-landing="demo-phone-card"
          data-step={view.step}
          data-outcome={view.outcome}
          className="flex flex-col gap-3 rounded-2xl border border-line-2 bg-surface p-4"
        >
          <span className="flex items-center gap-2 text-tag font-bold text-mute">
            <span className="size-1.5 rounded-full bg-topic-sd" />
            System design · Medium · Pick one
          </span>
          <span className="font-display text-heading font-semibold tracking-q text-pretty">{DEMO_QUESTION}</span>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_CHOICES.map((choice, index) => (
              <span
                key={choice}
                className={`flex min-h-11.5 items-center rounded-lg border px-3 py-2 text-small font-semibold transition-colors duration-300 motion-reduce:transition-none ${tone(index, view)}`}
              >
                {choice}
              </span>
            ))}
          </div>
          <div
            data-landing="demo-phone-verdict"
            className={`flex items-center gap-2.5 transition-[opacity,transform] duration-300 motion-reduce:transition-none ${view.marked ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
          >
            <span
              className={`grid size-7 flex-none place-items-center rounded-full border ${view.outcome === "right" ? "border-ok text-ok" : "border-bad text-bad"}`}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d={view.outcome === "right" ? "M3 8.5l3.2 3.2L13 4.8" : "M4.5 4.5l7 7M11.5 4.5l-7 7"}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className={`min-w-0 flex-1 font-display text-heading font-semibold ${view.outcome === "right" ? "text-ok" : "text-bad"}`}>
              {view.verdict}
            </span>
          </div>
          <div
            className={`flex flex-col gap-2 transition-opacity duration-300 motion-reduce:transition-none ${view.booked ? "opacity-100" : "opacity-20"}`}
          >
            <div className="grid grid-cols-31 gap-0.5">
              {Array.from({ length: PHONE_STRIP_SQUARES }, (_, day) => (
                <span
                  key={day}
                  className={`aspect-square rounded-square border transition-colors duration-300 motion-reduce:transition-none ${
                    day === 0 ? "border-cyan" : day === view.bookedSquare ? "border-cyan-deep bg-cyan" : "border-line bg-surface-2"
                  }`}
                />
              ))}
            </div>
            <div className="flex justify-between gap-2 font-display text-tag font-semibold text-mute">
              <span>Today</span>
              <span className="text-text-2">{view.booked ? view.booking : ""}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
