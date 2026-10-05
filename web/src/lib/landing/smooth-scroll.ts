// Smooth wheel scrolling for the landing page, with Lenis. It is loaded with import()
// only on this page, only where there is a mouse or trackpad (a phone scrolls natively),
// and never under reduced motion. Nothing else in the app imports it.
import { easeInOut } from "./particle-math";

interface Glider {
  scrollTo(y: number, options: { duration: number; easing: (t: number) => number }): void;
}

let running: Glider | null = null;

/** The scroll hint's glide to the demo: 3.2 seconds, slow at both ends. */
export function glideTo(y: number) {
  if (running) {
    running.scrollTo(y, { duration: 3.2, easing: easeInOut });
    return;
  }
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
}

/** Starts Lenis if this visitor has a pointer and has not asked for less motion. Returns what stops it. */
export async function startSmoothScroll(): Promise<() => void> {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pointer = window.matchMedia("(any-pointer: fine)").matches;
  if (reduced || !pointer) return () => undefined;
  const { default: Lenis } = await import("lenis");
  const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, autoRaf: true });
  running = lenis;
  return () => {
    running = null;
    lenis.destroy();
  };
}
