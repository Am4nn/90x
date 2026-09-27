"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js (push and offline caching) in production builds. The first
 * page loads before the worker controls it, so its scripts, styles and fonts
 * are handed over to be cached now rather than on the next visit.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        const assets = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => url.startsWith(`${location.origin}/_next/static/`));
        registration.active?.postMessage({ type: "cache-assets", assets });
      })
      .catch((e: unknown) => console.warn("service worker not registered", e));
  }, []);
  return null;
}
