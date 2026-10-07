"use client";

import { useEffect } from "react";
import { MAINTENANCE_HEADER } from "@/lib/maintenance/rules";

/**
 * An app tab left open when maintenance starts: its next server action or navigation gets the proxy's 503,
 * which Next would show as a generic error. This tells that answer apart (its header) and reloads, so the
 * person lands on the maintenance page and learns why. Unsent answers stay in the offline outbox.
 */
export function ReloadOnDown() {
  useEffect(() => {
    const original = window.fetch;
    let reloading = false;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await original(...args);
      if (!reloading && response.status === 503 && response.headers.get(MAINTENANCE_HEADER) === "1") {
        reloading = true;
        window.location.reload();
      }
      return response;
    };
    return () => {
      window.fetch = original;
    };
  }, []);
  return null;
}
