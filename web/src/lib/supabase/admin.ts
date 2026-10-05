import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Supabase with the secret (service role) key, which skips every row rule. Server only, and used
 *  for the one thing the API cannot do as the user: deleting the auth user. The second name is what
 *  the local and CI stacks set. */
export function adminClient() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set. See .env.example.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
