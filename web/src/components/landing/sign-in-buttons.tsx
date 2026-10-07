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
export function NavSignIn({ className = "" }: { className?: string }) {
  const { busy, signIn } = useGoogleSignIn();
  useWarmSignIn();
  return (
    <button
      type="button"
      data-cta="nav"
      disabled={busy}
      onClick={() => signIn("hero")}
      className={`h-10 rounded-lg border border-line-2 bg-surface px-4 text-nav font-semibold text-text transition-colors hover:bg-surface-2 ${className}`}
    >
      Sign in
    </button>
  );
}

/** The white "Continue with Google" button: the hero, the close and /try's pinned bar. `compact` is the bar's 15px form, which stays on one line at 360px. */
export function GoogleCta({
  spot,
  className = "",
  label = "Continue with Google",
  compact = false,
}: {
  spot: SignInSpot;
  className?: string;
  label?: string;
  compact?: boolean;
}) {
  const { busy, signIn } = useGoogleSignIn();
  useWarmSignIn();
  return (
    <button
      type="button"
      data-cta={spot}
      disabled={busy}
      onClick={() => signIn(spot)}
      className={`flex h-13 items-center justify-center rounded-lg bg-white font-bold text-background ring-1 ring-line-2 transition-colors hover:bg-text ${
        compact ? "gap-2.5 px-3 text-nav whitespace-nowrap" : "gap-3 pr-5.5 pl-4.5 text-heading"
      } ${className}`}
    >
      <GoogleMark className="size-5 flex-none" />
      {busy ? "Opening Google…" : label}
    </button>
  );
}

/** Confirms a deleted account: Settings sends the person to /?deleted=1 after it has signed them out. */
export function DeletedNotice({ className = "" }: { className?: string }) {
  if (!useSearchParams().has("deleted")) return null;
  return (
    <p role="status" data-landing="notice" className={`text-small text-ok ${className}`}>
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
    <p role="alert" data-landing="notice" className={`text-small text-bad ${className}`}>
      {message}
    </p>
  );
}
