"use server";

import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { logError } from "@/lib/log";
import { forgetDevice } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

/**
 * Signs this device out. `endpoint` is this browser's push subscription, sent by SignOutForm after it
 * unsubscribed: its row goes too, so a shared device stops getting the signed-out person's reminders
 * and friends' check-ins. It is removed only from the signed-in person's own devices.
 */
export async function signOut(form?: FormData) {
  const endpoint = form?.get("endpoint");
  if (typeof endpoint === "string" && endpoint) {
    // Signing out must work even when this cannot (the viewer lookup or the delete failing): the session still ends below.
    try {
      const viewer = await getViewer();
      if (viewer) await forgetDevice(viewer.id, endpoint);
    } catch (e) {
      logError("sign-out: push device not removed", e);
    }
  }
  const supabase = await createClient();
  // "local" ends only this device's session. supabase-js defaults to "global", which revoked every
  // device's refresh token: the installed iPhone app was signed out an hour later, when its token expired.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
