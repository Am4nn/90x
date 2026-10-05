"use client";

import { useRef, useState } from "react";
import { scramble } from "@/lib/landing/scramble";
import { useMotionPhase, useVisibleFrames } from "./use-motion";

/** How long the heading takes to land, in milliseconds, once it comes into view. */
const LAND_MS = 1400;

/**
 * "A feed that grades you back." landing out of symbols over 1.4s the first time it comes
 * into view. The sentence is in the heading for screen readers; the scramble is not read out.
 * Hidden in the HTML until hydrated, so there is no flash of the finished line first.
 */
export function FeedHeadline({ text }: { text: string }) {
  const phase = useMotionPhase();
  const line = useRef<HTMLSpanElement>(null);
  const [progress, setProgress] = useState(0);
  const live = phase === "live";
  useVisibleFrames(line, live && progress < 1, (ms) => setProgress((now) => Math.min(1, now + ms / LAND_MS)), { threshold: 0.15 });
  const landed = live ? Math.floor(progress * text.length) : text.length;
  return (
    <h2 className="max-w-feed font-display text-feed font-bold tracking-hero text-wrap">
      <span className="sr-only">{text}</span>
      <span ref={line} aria-hidden="true" data-pending={phase === "pending" ? "" : undefined}>
        <span>{text.slice(0, landed)}</span>
        <span className="text-mute-3">{scramble(text, landed, Math.floor(progress * 40))}</span>
      </span>
    </h2>
  );
}
