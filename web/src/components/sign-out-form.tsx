"use client";

import type { ReactNode } from "react";
import { signOut } from "@/app/actions/auth";

/**
 * Before the session ends, this browser's push subscription is cancelled and its endpoint sent along,
 * so signOut removes it on the server too: a shared device stops getting the last person's pushes.
 * Anything that fails here (no service worker, no push support) still signs out.
 */
async function signOutHere(form: FormData) {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (subscription) {
      form.set("endpoint", subscription.endpoint);
      await subscription.unsubscribe().catch(() => false);
    }
  } catch {
    // Push is not available here; nothing to remove.
  }
  await signOut(form);
}

export function SignOutForm({ children }: { children: ReactNode }) {
  return <form action={signOutHere}>{children}</form>;
}
