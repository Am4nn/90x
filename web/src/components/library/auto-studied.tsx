"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { markStudiedAction } from "@/app/actions/today";
import { dwellMs } from "@/lib/library/dwell";

// Reading a lesson marks the topic studied, but only on evidence. Two conditions, both required:
//
//   - the end of the lesson has been on screen, so it was scrolled through
//   - a minimum time has passed, scaled to the lesson's length
//
// Scrolling alone is a keystroke. "Studied" feeds coverage in the readiness
// score, so a glance that moves that number makes the score a lie. The manual
// button stays: it is how you say "I knew this already" without the wait.

export function AutoStudied({ slug, words, studied }: { slug: string; words: number; studied: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  const sent = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (studied || sent.current) return;
    const end = endRef.current;
    if (!end || typeof IntersectionObserver === "undefined") return;

    // Time only counts while the lesson is actually in front of the reader.
    // Wall-clock time let a background tab, or a scroll straight past the end,
    // mark a lesson studied that nobody read.
    const needed = dwellMs(words);
    let visibleMs = 0;
    let since: number | null = null;
    let atEnd = false;

    const reading = () => atEnd && document.visibilityState === "visible";
    const settle = () => {
      if (since !== null) {
        visibleMs += Date.now() - since;
        since = null;
      }
    };
    const tick = () => {
      settle();
      if (!sent.current && visibleMs >= needed) {
        sent.current = true;
        // Silent on failure: the manual button is right there, and an error
        // for something the reader never asked for is noise.
        // Then refresh, so the page's Mark studied button flips to its studied state.
        markStudiedAction(slug, true)
          .then((r) => {
            if (!r.error) router.refresh();
          })
          .catch(() => {});
      } else if (reading()) {
        since = Date.now();
      }
    };

    const timer = setInterval(tick, 1000);
    const observer = new IntersectionObserver((entries) => {
      atEnd = entries.some((e) => e.isIntersecting);
      if (reading() && since === null) since = Date.now();
      else settle();
    });
    observer.observe(end);
    document.addEventListener("visibilitychange", tick);

    return () => {
      observer.disconnect();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [slug, words, studied, router]);

  return <div ref={endRef} aria-hidden="true" />;
}
