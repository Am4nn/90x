"use client";

import { useSyncExternalStore } from "react";
import {
  DEMO_ANSWER,
  DEMO_CAPTIONS,
  DEMO_CHOICES,
  DEMO_QUESTION,
  DEMO_STEPS,
  demoView,
  quantize,
  REVIEW_STRIP,
  scrollProgress,
  unquantize,
} from "@/lib/landing/demo";
import { useMotionPhase } from "./use-motion";

// The page scrolls and the demo follows: scroll progress through this section is the
// only input, and the card, the steps and the strip are drawn from it. Reading the
// scroll position through useSyncExternalStore (in half-percents) means a scroll event
// that changes nothing visible re-renders nothing.

const FINISHED = quantize(1);

function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

function readProgress(): number {
  const section = document.querySelector('[data-landing="demo"]');
  if (!section) return FINISHED;
  const box = section.getBoundingClientRect();
  return quantize(scrollProgress(box.top, box.height, window.innerHeight));
}

/** Ren works one card: it is answered, marked, and booked to come back. 320vh of scrolling, pinned in a screen. */
export function PinnedDemo() {
  const phase = useMotionPhase();
  const scrolled = useSyncExternalStore(subscribe, readProgress, () => FINISHED);
  // Without scrolling (the server's HTML, or reduced motion) the demo is finished, and not pinned.
  const live = phase === "live";
  const sp = unquantize(live ? scrolled : FINISHED);
  const view = demoView(sp);
  return (
    <section data-landing="demo" aria-label="Ren works the card" className="relative z-1 h-demo motion-reduce:h-auto">
      <div className="sticky top-0 mx-auto flex h-svh max-h-pin max-w-content flex-wrap content-center items-center gap-x-16 gap-y-pin-gap px-gutter py-pin-y motion-reduce:static motion-reduce:h-auto motion-reduce:max-h-none motion-reduce:py-24">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-step-gap">
          <span aria-hidden="true" className="block h-0.5 w-full max-w-70 overflow-hidden rounded-full bg-line">
            <span className="block h-full bg-cyan" style={{ width: `${sp * 100}%` }} />
          </span>
          <ol className="flex flex-col gap-step-gap">
            {DEMO_STEPS.map((text, index) => (
              <li
                key={text}
                className={`items-baseline gap-4 transition-opacity duration-350 ${index === view.stage ? "flex" : "hidden @wide:flex"} ${
                  // Reduced motion: nothing is "current", so every step reads at full strength.
                  !live || index === view.stage ? "" : "opacity-25"
                }`}
              >
                <span aria-hidden="true" className="flex-none font-term text-nav font-bold text-ren-hot">
                  {`0${index + 1}`}
                </span>
                <span className="font-display text-step font-bold tracking-step">{text}</span>
              </li>
            ))}
          </ol>
          {/* The particles draw a question mark, a tick and the booked days here as the demo goes on. Nothing is drawn without them. */}
          <div data-landing="demo-viz" aria-hidden="true" className="h-30 w-full max-w-110 motion-reduce:hidden @wide:h-50" />
          <p className="min-h-4.5 font-term text-small font-medium text-mute">{DEMO_CAPTIONS[view.stage]}</p>
        </div>

        <div
          data-landing="demo-card"
          className="flex min-w-0 flex-[1.2_1_420px] flex-col gap-card-gap rounded-demo border border-line-2 bg-surface p-card-pad"
        >
          <span className="flex items-center gap-2 text-tag font-bold text-mute">
            <span className="size-1.5 rounded-full bg-topic-sd" />
            System design · Medium · Pick one
          </span>
          <span data-landing="demo-prompt" className="font-display text-q font-semibold tracking-q text-pretty">
            {DEMO_QUESTION}
          </span>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_CHOICES.map((choice, index) => {
              const chosen = index === DEMO_ANSWER && view.picked;
              const tone = !chosen
                ? "border-line-2 text-text-2"
                : view.marked
                  ? "border-ok bg-ok/8 text-ok"
                  : "border-cyan bg-cyan-bg text-cyan";
              return (
                <span
                  key={choice}
                  data-landing="demo-choice"
                  data-choice={index}
                  className={`flex min-h-choice items-center rounded-lg border px-3.5 py-2.5 text-choice font-semibold transition-colors duration-250 ${tone}`}
                >
                  {choice}
                </span>
              );
            })}
          </div>
          <div
            data-landing="demo-verdict"
            aria-hidden={!view.marked}
            className={`flex items-center gap-3 transition-[opacity,transform] duration-300 ${view.marked ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
          >
            <span className="grid size-7 flex-none place-items-center rounded-full border border-ok text-ok">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8.5l3.2 3.2L13 4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="font-display text-verdict font-semibold">Correct</span>
          </div>
          <div
            data-landing="demo-strip"
            className={`flex flex-col gap-2.5 transition-opacity duration-350 ${view.stage === 2 ? "opacity-100" : "opacity-20"}`}
          >
            <div className="grid grid-cols-15 gap-1">
              {Array.from({ length: REVIEW_STRIP.squares }, (_, day) => (
                <span
                  key={day}
                  data-landing="demo-day"
                  data-day={day}
                  className={`aspect-square rounded-square border transition-colors duration-250 ${
                    day === 0
                      ? "border-cyan bg-transparent"
                      : view.lit.includes(day)
                        ? "border-cyan-deep bg-cyan"
                        : "border-line bg-surface-2"
                  }`}
                />
              ))}
            </div>
            {/* Each label sits in its own square's column, centred under it. On a phone the squares are too
                narrow for "Today" and "+1" side by side, so "Today" drops to a second line, flush left. */}
            <div className="tabular grid grid-cols-15 gap-x-1 gap-y-0.5 font-display text-tag font-semibold text-mute">
              {REVIEW_STRIP.labels.map(({ day, text }) => (
                <span
                  key={day}
                  className={`whitespace-nowrap ${day === 0 ? "row-start-2 justify-self-start @wide:row-start-1 @wide:justify-self-center" : "row-start-1 justify-self-center"}`}
                  style={{ gridColumnStart: day + 1 }}
                >
                  {text}
                </span>
              ))}
            </div>
            <p className="text-tag font-medium text-mute">{REVIEW_STRIP.caption}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
