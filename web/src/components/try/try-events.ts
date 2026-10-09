import { bucketSeconds, type TryKind, type TryStep } from "@/lib/try/steps";

// The /try beacon, browser side. A visit is a random id held in this module's memory for one page load: never a
// cookie, never storage, never tied to an account. Every send is fire-and-forget and swallows its own errors, so
// counting can never break the page.

const URL = "/api/try/event";
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const VISIT_LENGTH = 24;

type TryData = Record<string, string | number | boolean>;

let visit: string | null = null;
// The visit's memory lives here, not in a component: a return to /try in the same tab is the same visit, so it neither
// counts a second view nor a second leave.
let kinds: TryKind[] = [];
let leaveSent = false;
let startedAt: number | null = null;
let pendingLeave: ReturnType<typeof setTimeout> | null = null;

/** Forgets the visit (tests only: a real page load starts with a fresh module). */
export function resetVisit(): void {
  visit = null;
  kinds = [];
  leaveSent = false;
  startedAt = null;
  pendingLeave = null;
}

/** The kinds sent so far this visit, in order. */
export const visitKinds = (): readonly TryKind[] => kinds;

/** A fresh visit id: 24 lowercase letters and digits from the browser's crypto. */
export function newVisit(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(VISIT_LENGTH));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Sends one event for this page load's visit. Never throws, never waits. */
export function track(kind: TryKind, data?: TryData): void {
  kinds.push(kind);
  try {
    visit ??= newVisit();
    const body = JSON.stringify({ visit, kind, data });
    // sendBeacon survives the page closing; it answers false when the browser will not queue it, so fall back.
    if (navigator.sendBeacon?.(URL, new Blob([body], { type: "application/json" }))) return;
    void fetch(URL, { method: "POST", keepalive: true, body, headers: { "Content-Type": "application/json" } }).catch(() => {});
  } catch {
    // Counting is best-effort.
  }
}

/** Like `track`, but a kind already sent this visit is not sent again. */
export function trackOnce(kind: TryKind, data?: TryData): void {
  if (!kinds.includes(kind)) track(kind, data);
}

/** Sends one `leave` per visit (time on the page, bucketed, and how far it got): the first time the tab is hidden, or
 *  when the cleanup runs because the visitor navigated away inside the app. Returns the cleanup for an effect. */
export function watchLeave(getStep: () => TryStep): () => void {
  startedAt ??= Date.now();
  if (pendingLeave !== null) {
    // React's dev remount stops a watcher and starts the next at once: that is not a leave.
    clearTimeout(pendingLeave);
    pendingLeave = null;
  }
  const leave = () => {
    if (leaveSent) return;
    leaveSent = true;
    track("leave", { seconds: bucketSeconds((Date.now() - (startedAt ?? Date.now())) / 1000), step: getStep() });
  };
  const onChange = () => {
    if (document.visibilityState === "hidden") leave();
  };
  document.addEventListener("visibilitychange", onChange);
  return () => {
    document.removeEventListener("visibilitychange", onChange);
    // In-app navigation (Back to 90x, Terms) unmounts the page without hiding the tab: that is the leave.
    pendingLeave = setTimeout(() => {
      pendingLeave = null;
      leave();
    }, 0);
  };
}
