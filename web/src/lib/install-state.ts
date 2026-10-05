"use client";

import { type InstallMode, installMode, isIos, isIosSafari, isStandalone } from "./install";

// Browser side of the install prompts. Chromium fires `beforeinstallprompt` once, early, possibly
// before the component that wants it has mounted, so the root layout captures it here.

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const DISMISS_KEY = "90x-install-dismissed";
const notify = () => listeners.forEach((l) => l());

const onPrompt = (e: Event) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
  notify();
};
const onInstalled = () => {
  deferred = null;
  notify();
};

export function captureInstallPrompt() {
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The environment as installMode wants it. Server render sees "none", so nothing mismatches. */
export function currentInstallMode(): InstallMode {
  return installMode({ standalone: standaloneNow(), hasPrompt: deferred !== null, iosSafari: isIosSafari(navigator) });
}

const standaloneNow = () =>
  isStandalone((navigator as Navigator & { standalone?: boolean }).standalone, window.matchMedia("(display-mode: standalone)").matches);

/** True on any iPhone/iPad browser that is not the installed app: notifications cannot work there. */
export function iosNeedsInstall(): boolean {
  return isIos(navigator) && !standaloneNow();
}

export async function runInstallPrompt() {
  const event = deferred;
  if (!event) return;
  deferred = null;
  notify();
  await event.prompt();
}

export function dismissedAt(): number | null {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export function dismissInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Private mode: the banner just comes back next visit.
  }
  notify();
}
