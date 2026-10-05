"use client";

import { useRef, useState } from "react";
import { headlineFrame, PHRASES, STILL_HEADLINE } from "@/lib/landing/scramble";
import { useMotionPhase, useVisibleFrames } from "./use-motion";

/**
 * The hero's second line: "grades what you type.", then two more phrases, each
 * landing letter by letter out of symbols. The server renders the first phrase whole,
 * hidden until this has hydrated, so there is no flash of the finished line before the
 * scramble starts; a visitor who asked for less motion simply keeps it.
 */
export function HeroHeadline() {
  const phase = useMotionPhase();
  const line = useRef<HTMLSpanElement>(null);
  const [elapsed, setElapsed] = useState(0);
  useVisibleFrames(line, phase === "live", (ms) => setElapsed((now) => now + ms));
  const frame = phase === "live" ? headlineFrame(elapsed) : STILL_HEADLINE;
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
        <span>{frame.landed}</span>
        <span className="text-mute-3">{frame.noise}</span>
      </span>
    </span>
  );
}
