"use client";

import { useEffect } from "react";
import { startSmoothScroll } from "@/lib/landing/smooth-scroll";
import { useMotionPhase } from "./use-motion";

/** Turns on smooth wheel scrolling once the page is up (and nothing else; it renders no markup). */
export function SmoothScroll() {
  const phase = useMotionPhase();
  useEffect(() => {
    if (phase !== "live") return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    // Idle, after the first paint and the intro have started: the page does not wait for it.
    const begin = () => {
      void startSmoothScroll().then((stopper) => {
        if (cancelled) stopper();
        else stop = stopper;
      });
    };
    const timer = window.setTimeout(begin, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stop?.();
    };
  }, [phase]);
  return null;
}
