"use client";

import { useEffect } from "react";
import { syncOnOpen } from "@/app/actions/sync";

/** Quietly syncs LeetCode when the app opens (the server throttles to once per 15 min). */
export function SyncOnOpen() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("90x:synced")) return;
      sessionStorage.setItem("90x:synced", "1");
    } catch {
      // storage unavailable: the server-side throttle still applies
    }
    syncOnOpen().catch(() => {});
  }, []);
  return null;
}
