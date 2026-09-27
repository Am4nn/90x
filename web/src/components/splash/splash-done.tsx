"use client";

import { useEffect } from "react";
import { SPLASH_SEEN_KEY } from "./splash-script";

/** Once the app has hydrated, remembers the splash for this tab and fades it out, after the x has finished drawing. */
export function SplashDone() {
  useEffect(() => {
    try {
      sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
    } catch {
      // Storage blocked: the splash shows again on the next cold load, nothing worse.
    }
    let cancelled = false;
    const drawing = document.querySelector(".splash-x2")?.getAnimations() ?? [];
    Promise.all(drawing.map((a) => a.finished))
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) document.documentElement.classList.add("splash-done");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
