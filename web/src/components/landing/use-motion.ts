"use client";

import { type RefObject, useEffect, useEffectEvent, useSyncExternalStore } from "react";

/**
 * "pending" until the page has hydrated (and in the HTML a visitor first sees), then
 * "live" or, when the visitor asked their system for less motion, "still". Anything that
 * animates shows its finished state under "still" and is hidden under "pending".
 */
export type MotionPhase = "pending" | "live" | "still";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useMotionPhase(): MotionPhase {
  return useSyncExternalStore<MotionPhase>(
    subscribe,
    () => (window.matchMedia(QUERY).matches ? "still" : "live"),
    () => "pending",
  );
}

/**
 * Calls `onFrame` with the milliseconds since the last call, at most `fps` times a second,
 * and only while `threshold` of `target` is on screen (0 is any of it), so nothing animates where nobody can see it.
 */
export function useVisibleFrames(
  target: RefObject<Element | null>,
  enabled: boolean,
  onFrame: (elapsed: number) => void,
  { fps = 30, threshold = 0 }: { fps?: number; threshold?: number } = {},
) {
  const frame = useEffectEvent(onFrame);
  useEffect(() => {
    const element = target.current;
    if (!enabled || !element) return;
    const every = 1000 / fps - 1;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const elapsed = last ? now - last : every + 1;
      if (elapsed >= every) {
        last = now;
        // A tab left in the background must not fast-forward the animation when it returns.
        frame(Math.min(100, elapsed));
      }
      raf = requestAnimationFrame(tick);
    };
    const watch = new IntersectionObserver(
      (entries) => {
        cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
        if (entries.some((entry) => entry.isIntersecting)) raf = requestAnimationFrame(tick);
      },
      { threshold },
    );
    watch.observe(element);
    return () => {
      watch.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [target, enabled, fps, threshold]);
}
