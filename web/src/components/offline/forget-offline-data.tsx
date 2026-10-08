"use client";

import { useEffect } from "react";
import { forgetCards } from "@/lib/offline/store";

// Whose pages and cards this device holds. Pages kept for offline use (Today, the Feed) are one
// person's, and nothing in them says whose: a session that ends without a landing visit (expiry,
// sign-out in another tab) would leave them for the next person who signs in here.
const OWNER_KEY = "90x:offline-owner";
const PAGES_PREFIX = "90x-pages-";
const WORKER_REPLY_MS = 5000;

function readOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function writeOwner(userId: string | undefined) {
  try {
    if (userId) localStorage.setItem(OWNER_KEY, userId);
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    // No storage: the copies are forgotten on every open instead, which is the safe side.
  }
}

/** Asks the service worker to drop its page copies (it also stops a page fetched before now being kept after), and waits for its answer. */
function askWorker(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => done(false), WORKER_REPLY_MS);
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "forget-pages-done") done(event.data.ok === true);
    };
    function done(ok: boolean) {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("message", onMessage);
      resolve(ok);
    }
    navigator.serviceWorker.addEventListener("message", onMessage);
    worker.postMessage({ type: "forget-pages" }, []); // A worker takes a transfer list here, not a target origin.
  });
}

/** True once the page copies are gone: the worker confirmed it, and none is left in Cache Storage either. */
async function forgetPages(): Promise<boolean> {
  try {
    const worker = (await navigator.serviceWorker?.getRegistration())?.active;
    const workerOk = worker ? await askWorker(worker) : true;
    // Deleted here too, so a copy left by a worker that is gone (or did not answer) still goes.
    if (typeof caches !== "undefined") {
      const names = (await caches.keys()).filter((name) => name.startsWith(PAGES_PREFIX));
      await Promise.all(names.map((name) => caches.delete(name)));
    }
    return workerOk;
  } catch {
    return false;
  }
}

/**
 * Forgets the pages and cards saved for offline use. On the landing page (no `userId`, where
 * signed-out visitors arrive) always; in the app layout only when the signed-in person is not the
 * one they were saved for. The new owner is recorded only once both are confirmed gone, so a
 * cleanup that failed is tried again on the next open.
 */
export function ForgetOfflineData({ userId }: { userId?: string }) {
  useEffect(() => {
    if (userId && readOwner() === userId) return;
    let cancelled = false;
    void Promise.all([forgetCards(), forgetPages()]).then(([cards, pages]) => {
      if (!cancelled && cards && pages) writeOwner(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return null;
}
