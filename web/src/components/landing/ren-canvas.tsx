"use client";

import { useEffect, useRef } from "react";
import { useMotionPhase } from "./use-motion";

/**
 * Ren, drawn in text on a canvas. The drawing code is a separate chunk, fetched after the
 * page has painted (the page reads fine without Ren), and it redraws only while on screen.
 * The canvas is blank until the first frame is ready, then fades in.
 */
export function RenCanvas() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const phase = useMotionPhase();
  useEffect(() => {
    const element = canvas.current;
    if (!element || phase === "pending") return;
    let handle: { destroy(): void } | undefined;
    let cancelled = false;
    // After the next two frames: the first paint is not waiting for Ren's code.
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void import("@/lib/landing/ren-renderer").then(({ mountRen }) => {
          // Live, the particle overlay brings Ren in; reduced motion draws it still, at once.
          if (!cancelled) handle = mountRen(element, { still: phase === "still", staged: phase === "live" });
        });
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      handle?.destroy();
    };
  }, [phase]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label="Ren, the 90x coach, drawn in ASCII"
      data-landing="ren"
      className="absolute inset-0 block opacity-0 transition-opacity duration-700 data-[ready=true]:opacity-100"
    />
  );
}
