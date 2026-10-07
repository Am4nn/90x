"use client";

import { useEffect } from "react";
import { markOpenedAction } from "@/app/actions/today";
import { OPENED_MS, visibleClock } from "@/lib/library/dwell";

// A minute with a lesson in front of the reader shows it as opened in the Library's topic list
//. Only visible time counts: a background tab is not reading. Nothing on
// the page changes; studying it (AutoStudied, Mark studied) is the stronger mark. It is sent on
// every visit, so a lesson opened again is counted as a re-open on the admin Analytics page.

export function AutoOpened({ slug }: { slug: string }) {
  useEffect(() => {
    const clock = visibleClock();
    let sent = false;
    const tick = () => {
      const now = Date.now();
      if (document.visibilityState === "visible") clock.resume(now);
      else clock.pause(now);
      if (!sent && clock.elapsed(now) >= OPENED_MS) {
        sent = true;
        // Silent on failure: the reader never asked for this.
        void markOpenedAction(slug);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [slug]);

  return null;
}
