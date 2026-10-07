"use client";

import { useSyncExternalStore } from "react";

// One Google sign-in for the whole landing page and /try. The nav button, the hero button, the
// closing button and /try's bar share it, so once one is clicked all of them read "Opening Google…"
// and none can be clicked twice.

/** Which button was clicked; the error is shown beside it. The nav button counts as the hero's. */
export type SignInSpot = "hero" | "close" | "try" | "maintenance";

interface SignInState {
  busy: boolean;
  /** Google could not be reached. */
  failed: boolean;
  spot: SignInSpot | null;
}

const IDLE: SignInState = { busy: false, failed: false, spot: null };
let state = IDLE;
const listeners = new Set<() => void>();

function set(next: SignInState) {
  state = next;
  listeners.forEach((listener) => listener());
}

// Coming back to the page with the browser's Back button restores it as it was left,
// "Opening Google…" and all. A restored page has not gone anywhere, so start over.
function onPageShow(event: PageTransitionEvent) {
  if (event.persisted) set(IDLE);
}

function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener("pageshow", onPageShow);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("pageshow", onPageShow);
  };
}

// The Supabase client is loaded when it is needed, not with the page: most visitors read
// before they click. `warm` fetches it in an idle moment so the click itself does not wait.
const supabase = () => import("@/lib/supabase/client");

export function warmSignIn() {
  void supabase();
}

async function signIn(spot: SignInSpot) {
  if (state.busy) return;
  set({ busy: true, failed: false, spot });
  try {
    const { createClient } = await supabase();
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
    // On success the browser is already on its way to Google; the page stays "busy" until it goes.
  } catch {
    set({ busy: false, failed: true, spot });
  }
}

export function useGoogleSignIn() {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => IDLE,
  );
  return { ...current, signIn };
}
