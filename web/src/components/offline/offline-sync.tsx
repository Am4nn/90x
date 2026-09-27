"use client";

import { useEffect, useState } from "react";
import { getUpcomingCards, submitAnswer } from "@/app/actions/feed";
import { syncedLine } from "@/lib/offline/outbox";
import { refreshCards, sendQueuedAnswers } from "@/lib/offline/sync";
import { useOnline } from "./use-online";

const LINE_MS = 5000;

/**
 * In the app layout: on open and on every reconnect, sends answers made
 * offline, tops up the cards kept for offline use, and asks the service worker
 * to keep Today and the Feed. Says briefly how many answers were graded.
 */
export function OfflineSync({ userId }: { userId: string }) {
  const online = useOnline();
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    void sendQueuedAnswers(userId, submitAnswer).then((summary) => {
      if (!cancelled) setLine(syncedLine(summary));
      void refreshCards(userId, getUpcomingCards);
    });
    navigator.serviceWorker?.ready.then((registration) => registration.active?.postMessage({ type: "warm-pages" })).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [online, userId]);

  useEffect(() => {
    if (!line) return;
    const timer = setTimeout(() => setLine(null), LINE_MS);
    return () => clearTimeout(timer);
  }, [line]);

  if (!line) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-full border border-line-2 bg-surface-2 px-4 py-2 text-small font-semibold text-text shadow-lg md:bottom-8"
    >
      {line}
    </div>
  );
}
