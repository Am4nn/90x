"use client";

import { useState } from "react";
import { asOfText } from "@/lib/offline/as-of";
import { useOnline } from "./use-online";

/**
 * Shown only while offline. With `renderedAt` (when the server rendered this
 * page) it says how old the copy on screen is.
 */
export function OfflineBanner({ renderedAt, children }: { renderedAt?: string; children?: React.ReactNode }) {
  const online = useOnline();
  const [now] = useState(() => new Date());
  if (online) return null;
  return (
    <div role="status" className="rounded-xl border border-warn/40 bg-surface px-4 py-3 text-small text-text-2">
      {children ?? (renderedAt ? `You're offline. Showing today as of ${asOfText(new Date(renderedAt), now)}.` : "You're offline.")}
    </div>
  );
}
