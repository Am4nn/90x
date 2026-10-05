"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { GoogleMark } from "./google-mark";
import { type SignInSpot, useGoogleSignIn, warmSignIn } from "./use-google-sign-in";

/** Fetches the sign-in code once the browser is idle, so the first click does not wait for it. */
function useWarmSignIn() {
  useEffect(() => {
    // Safari has no requestIdleCallback.
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(warmSignIn);
    else window.setTimeout(warmSignIn, 1500);
  }, []);
}

/** The small "Sign in" button in the nav. */
export function NavSignIn() {
  const { busy, signIn } = useGoogleSignIn();
  useWarmSignIn();
  return (
    <button
      type="button"
      data-cta="nav"
      disabled={busy}
      onClick={() => signIn("hero")}
      className="h-10 rounded-lg border border-line-2 bg-surface px-4 text-nav font-semibold text-text transition-colors hover:bg-surface-2"
    >
      Sign in
    </button>
  );
}

/** The white "Continue with Google" button, in the hero and again at the close. */
export function GoogleCta({ spot, className = "" }: { spot: SignInSpot; className?: string }) {
  const { busy, signIn } = useGoogleSignIn();
  useWarmSignIn();
  return (
    <button
      type="button"
      data-cta={spot}
      disabled={busy}
      onClick={() => signIn(spot)}
      className={`flex h-13 items-center justify-center gap-3 rounded-lg bg-white pr-5.5 pl-4.5 text-heading font-bold text-background ring-1 ring-line-2 transition-colors hover:bg-text ${className}`}
    >
      <GoogleMark className="size-5" />
      {busy ? "Opening Google…" : "Continue with Google"}
    </button>
  );
}

/** Confirms a deleted account: Settings sends the person to /?deleted=1 after it has signed them out. */
export function DeletedNotice({ className = "" }: { className?: string }) {
  if (!useSearchParams().has("deleted")) return null;
  return (
    <p role="status" className={`text-small text-ok ${className}`}>
      Your account and data were deleted.
    </p>
  );
}

/** Says so when sign-in did not work: Google could not be reached, or the return trip from it failed (?error=). */
export function SignInNotice({ spot, className = "" }: { spot: SignInSpot; className?: string }) {
  const { failed, spot: failedAt } = useGoogleSignIn();
  // Back from Google with an error; the hero is where the person is looking.
  const returned = useSearchParams().has("error");
  const message =
    failed && failedAt === spot
      ? "Couldn't reach Google sign-in. Try again in a moment."
      : returned && spot === "hero"
        ? "Sign-in didn't complete. Try again."
        : null;
  if (!message) return null;
  return (
    <p role="alert" className={`text-small text-bad ${className}`}>
      {message}
    </p>
  );
}
