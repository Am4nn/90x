"use client";

import { useState } from "react";
import { GoogleIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";

export function GoogleButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) {
      setError("Couldn't reach Google sign-in. Try again in a moment.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="flex h-12 items-center justify-center gap-3 rounded-xl border border-line-2 bg-surface font-semibold text-text transition-colors hover:bg-surface-2 disabled:opacity-60"
      >
        <GoogleIcon className="h-5 w-5" />
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && <p className="text-small text-bad">{error}</p>}
    </div>
  );
}
