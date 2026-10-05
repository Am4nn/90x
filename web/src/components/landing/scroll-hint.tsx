"use client";

import { useRef, useSyncExternalStore } from "react";
import { glideTo } from "@/lib/landing/smooth-scroll";

/** Scrolled further than this, and the hint has done its job. */
const GONE_AFTER_PX = 40;

function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

/** Where the "scroll to see Ren work" prompt takes you: the demo, or whatever section follows the hero. */
function nextSection(from: HTMLElement): Element | null {
  return document.querySelector('[data-landing="demo"]') ?? from.closest('[data-landing="hero"]')?.nextElementSibling ?? null;
}

export function ScrollHint() {
  const button = useRef<HTMLButtonElement>(null);
  const showing = useSyncExternalStore(
    subscribe,
    () => window.scrollY <= GONE_AFTER_PX,
    () => true,
  );
  function go() {
    const target = button.current && nextSection(button.current);
    if (!target) return;
    glideTo(target.getBoundingClientRect().top + window.scrollY);
  }
  return (
    <button
      ref={button}
      type="button"
      onClick={go}
      // Once faded it also leaves the tab order and the accessibility tree.
      inert={!showing}
      // On a phone the mock's hint is position:relative with bottom:20px, so it sits 20px above its place in the column.
      className={`relative bottom-5 order-3 mt-10 flex flex-none flex-col items-center gap-2 self-center rounded-lg px-3 pt-1.5 pb-1 transition-opacity duration-400 hover:bg-surface @wide:absolute @wide:bottom-5 @wide:left-1/2 @wide:mt-0 @wide:-translate-x-1/2 @wide:py-2 ${
        showing ? "" : "pointer-events-none opacity-0"
      }`}
    >
      <span className="text-tag font-semibold tracking-hint text-text uppercase">Scroll to see Ren work</span>
      <span className="inline-grid animate-hint-bob grid-cols-5 grid-rows-3 gap-0.75 motion-reduce:animate-none" aria-hidden="true">
        <span className="col-start-1 row-start-1 size-1 rounded-full bg-mute-2" />
        <span className="col-start-5 row-start-1 size-1 rounded-full bg-mute-2" />
        <span className="col-start-2 row-start-2 size-1 rounded-full bg-ren-soft" />
        <span className="col-start-4 row-start-2 size-1 rounded-full bg-ren-soft" />
        <span className="col-start-3 row-start-3 size-1 rounded-full bg-ren-hot" />
      </span>
    </button>
  );
}
