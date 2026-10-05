"use client";

import { useRef, useState } from "react";
import { headlineFrame, STILL_HEADLINE } from "@/lib/landing/scramble";
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
  return (
    <span ref={line} aria-hidden="true" data-pending={phase === "pending" ? "" : undefined} className="block min-h-hero-line">
      <span>{frame.landed}</span>
      <span className="text-mute-3">{frame.noise}</span>
    </span>
  );
}
