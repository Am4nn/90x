"use client";

import { useEffect, useRef } from "react";
import { useMotionPhase } from "./use-motion";

/**
 * The "90x" at the close, as a field of dots that light up round the cursor. It fills the
 * close section behind its content, fading in over its top 44px. The drawing code is its
 * own chunk, fetched after first paint; under reduced motion it draws the finished
 * wordmark once, with no cursor and no glitch.
 */
export function DotWordmark() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const phase = useMotionPhase();
  useEffect(() => {
    const element = canvas.current;
    if (phase === "pending" || !element) return;
    let handle: { destroy(): void } | undefined;
    let cancelled = false;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void import("@/lib/landing/dot-wordmark").then(({ mountWordmark }) => {
          if (!cancelled) handle = mountWordmark(element, { still: phase === "still" });
        });
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      handle?.destroy();
    };
  }, [phase]);
  return <canvas ref={canvas} aria-hidden="true" data-landing="wordmark" className="absolute inset-0 block landing-fade-top" />;
}
