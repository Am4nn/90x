"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { headlineFrame, PHRASES, STILL_HEADLINE } from "@/lib/landing/scramble";
import { landingRoot, subscribeLandingWidth, useMotionPhase, useVisibleFrames } from "./use-motion";

/** The landing's wide layout (`@wide:`), read from the landing root's own width as the container query does. */
const isWide = () => (landingRoot()?.clientWidth ?? 0) >= 760;

/**
 * The hero's second line: "that plans your day.", then two more phrases, the words that
 * change landing letter by letter out of symbols. Only the wide layout rotates; a phone,
 * and a visitor who asked for less motion, keep the first phrase pinned. The server renders
 * the first phrase whole, hidden until this has hydrated, so nothing flashes before it settles.
 */
export function HeroHeadline() {
  const phase = useMotionPhase();
  const wide = useSyncExternalStore(subscribeLandingWidth, isWide, () => false);
  const live = phase === "live" && wide;
  const line = useRef<HTMLSpanElement>(null);
  const [elapsed, setElapsed] = useState(0);
  useVisibleFrames(line, live, (ms) => setElapsed((now) => now + ms));
  const frame = live ? headlineFrame(elapsed) : STILL_HEADLINE;
  // One grid cell holds all three phrases, invisible, and the live frame on top. The cell is
  // as tall as the longest phrase wraps at this width, so the block never changes height
  // as the phrases rotate. The live frame is zero-height (its overflow still shows), so
  // scramble noise, whose glyphs are not as wide as the letters, can never push the block taller.
  return (
    <span ref={line} aria-hidden="true" data-pending={phase === "pending" ? "" : undefined} className="grid min-h-hero-line grid-cols-1">
      {PHRASES.map((phrase) => (
        <span key={phrase} className="invisible col-start-1 row-start-1">
          {phrase}
        </span>
      ))}
      <span className="col-start-1 row-start-1 h-0">
        {frame.parts.map((part, i) => (
          <span key={i} className={part.noise ? "text-mute-3" : undefined}>
            {part.text}
          </span>
        ))}
      </span>
    </span>
  );
}
