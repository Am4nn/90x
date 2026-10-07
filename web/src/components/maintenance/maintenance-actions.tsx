"use client";

import { button } from "@/components/button-styles";
import { useGoogleSignIn } from "@/components/landing/use-google-sign-in";

/** Loads the page again: the app answers once maintenance is over. */
export function CheckAgain() {
  return (
    <button type="button" onClick={() => window.location.reload()} className={`${button({ size: "lg" })} mt-7`}>
      Check again
    </button>
  );
}

/** A quiet way in for an admin, whose usual sign-in on the landing page is behind this page now. */
export function AdminSignIn() {
  const { busy, signIn } = useGoogleSignIn();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => signIn("maintenance")}
      className="min-h-11 px-3 text-small text-mute underline-offset-4 hover:text-text-2 hover:underline"
    >
      {busy ? "Opening Google…" : "Admin? Sign in"}
    </button>
  );
}
