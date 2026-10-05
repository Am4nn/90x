"use client";

import { useEffect, useRef } from "react";
import { useMotionPhase } from "./use-motion";

/**
 * The particle overlay: a canvas as tall as the window, pinned to the top of the page and
 * over everything, that lets every click through. It draws nothing here: the engine is a
 * separate chunk, fetched after the first paint, and under reduced motion it never is. The
 * wrapper is 0px tall, so it is in the page's flow but takes no room.
 */
export function ParticleStage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const phase = useMotionPhase();
  useEffect(() => {
    const element = canvas.current;
    if (phase !== "live" || !element) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void import("@/lib/landing/particles").then(({ startParticles }) => {
          if (!cancelled) stop = startParticles(element);
        });
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stop?.();
    };
  }, [phase]);
  return (
    <div aria-hidden="true" className="pointer-events-none sticky top-0 z-5 h-0">
      <canvas ref={canvas} data-landing="particles" className="absolute top-0 left-0 block h-screen w-full" />
    </div>
  );
}
