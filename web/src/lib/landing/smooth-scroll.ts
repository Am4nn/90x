import { isNarrow } from "./pages";
// Smooth wheel scrolling for the landing page, with Lenis. It is loaded with import()
// only on this page, only where there is a mouse or trackpad (a phone scrolls natively),
// never on the phone layout and never under reduced motion. Nothing else in the app imports it.
import { easeInOut } from "./particle-math";

interface Glider {
  scrollTo(y: number, options: { duration: number; easing: (t: number) => number }): void;
}

let running: Glider | null = null;

/** A glide to `y`: 3.2 seconds by default (the scroll hint), slow at both ends. */
export function glideTo(y: number, seconds = 3.2) {
  if (running) {
    running.scrollTo(y, { duration: seconds, easing: easeInOut });
    return;
  }
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
}

/**
 * Starts Lenis if this visitor has a pointer and has not asked for less motion, and keeps it
 * in step with the layout: it runs only while the root is at least as wide as the phone
 * breakpoint (the phone layout snaps between pages, and Lenis does not support scroll-snap).
 * Returns what stops it for good.
 */
export async function startSmoothScroll(): Promise<() => void> {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pointer = window.matchMedia("(any-pointer: fine)").matches;
  if (reduced || !pointer) return () => undefined;
  const { default: Lenis } = await import("lenis");
  const root = document.querySelector<HTMLElement>('[data-landing="root"]');
  let lenis: InstanceType<typeof Lenis> | null = null;
  const halt = () => {
    if (!lenis) return;
    running = null;
    lenis.destroy();
    lenis = null;
  };
  const apply = () => {
    if (root && isNarrow(root.clientWidth)) halt();
    else if (!lenis) {
      lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, autoRaf: true });
      running = lenis;
    }
  };
  apply();
  const watch = root ? new ResizeObserver(apply) : null;
  if (root) watch?.observe(root);
  return () => {
    watch?.disconnect();
    halt();
  };
}
