"use client";

import { useEffect } from "react";
import { isNarrow } from "@/lib/landing/pages";

/**
 * Turns on vertical scroll snapping for the phone layout. The scroller is the page itself, so the
 * property goes on <html>: a container query styles descendants of the landing root, never the
 * scroller. It measures the root with the same 760px the container query uses, so the layout and
 * the snapping cannot disagree, and it lets go when the visitor leaves the page.
 */
export function SnapScroll() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-landing="root"]');
    if (!root) return;
    const html = document.documentElement;
    const apply = () => {
      html.style.scrollSnapType = isNarrow(root.clientWidth) ? "y mandatory" : "";
    };
    apply();
    const watch = new ResizeObserver(apply);
    watch.observe(root);
    return () => {
      watch.disconnect();
      html.style.scrollSnapType = "";
    };
  }, []);
  return null;
}
