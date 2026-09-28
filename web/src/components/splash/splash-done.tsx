"use client";

import { useEffect } from "react";
import { SPLASH_SEEN_KEY } from "./splash-script";

/** Once the app has hydrated, remembers the splash for this tab and fades it out.
 *
 *  It used to wait for the x to finish drawing before fading, which held the
 *  splash for at least 820ms on every cold start. Nothing draws now, so the
 *  fade begins as soon as there is something to show. */
export function SplashDone() {
  useEffect(() => {
    try {
      sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
    } catch {
      // Storage blocked: the splash shows again on the next cold load, nothing worse.
    }
    document.documentElement.classList.add("splash-done");
  }, []);
  return null;
}
