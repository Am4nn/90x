"use client";

import { useEffect } from "react";
import { forgetCards } from "@/lib/offline/store";

/** On the sign-in page: pages and cards saved for offline use belong to whoever was signed in, so they go. */
export function ForgetOfflineData() {
  useEffect(() => {
    void forgetCards();
    navigator.serviceWorker
      ?.getRegistration()
      .then((registration) => registration?.active?.postMessage({ type: "forget-pages" }))
      .catch(() => undefined);
  }, []);
  return null;
}
