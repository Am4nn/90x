import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { type Approval, gate } from "./gate";

export type Viewer = {
  id: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  approval: Approval;
  isAdmin: boolean;
  setupDone: boolean;
  language: string | null;
  hasPremium: boolean;
  timezone: string;
};

/** The signed-in user with approval and profile, once per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: approval }, { data: profile }] = await Promise.all([
    supabase.from("user_approvals").select("status, is_admin").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("profiles")
      .select("name, avatar_url, setup_done_at, language, has_leetcode_premium, timezone")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  return {
    id: user.id,
    email: user.email ?? null,
    name: profile?.name || user.email || "",
    avatarUrl: profile?.avatar_url ?? null,
    approval: (approval?.status as Approval) ?? null,
    isAdmin: Boolean(approval?.status === "approved" && approval?.is_admin),
    setupDone: Boolean(profile?.setup_done_at),
    language: profile?.language ?? null,
    hasPremium: Boolean(profile?.has_leetcode_premium),
    timezone: profile?.timezone ?? "UTC",
  };
});

/** For pages inside the app: redirects unless signed in, approved and set up. */
export async function requireViewer(options: { allowSetup?: boolean } = {}): Promise<Viewer> {
  const viewer = await getViewer();
  const to = gate({ userId: viewer?.id ?? null, approval: viewer?.approval ?? null, setupDone: viewer?.setupDone ?? false });
  if (to && !(options.allowSetup && to === "/setup")) redirect(to);
  return viewer!;
}
