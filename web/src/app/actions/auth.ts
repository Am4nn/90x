"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  // "local" ends only this device's session. supabase-js defaults to "global", which revoked every
  // device's refresh token: the installed iPhone app was signed out an hour later, when its token expired.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
