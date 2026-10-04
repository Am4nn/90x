import "server-only";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { profiles } from "@/db/schema";
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
  const [{ data: approval }, [profile]] = await Promise.all([
    supabase.from("user_approvals").select("status, is_admin").eq("user_id", user.id).maybeSingle(),
    // The private profile columns are read over the server connection, not the
    // authenticated role: profiles' SELECT is column-granted to (user_id, name,
    // avatar_url), so a client can't read setup_done_at, language, timezone, etc.
    db
      .select({
        name: profiles.name,
        avatarUrl: profiles.avatarUrl,
        setupDoneAt: profiles.setupDoneAt,
        language: profiles.language,
        hasLeetcodePremium: profiles.hasLeetcodePremium,
        timezone: profiles.timezone,
      })
      .from(profiles)
      .where(eq(profiles.userId, user.id)),
  ]);
  return {
    id: user.id,
    email: user.email ?? null,
    name: profile?.name || user.email || "",
    avatarUrl: profile?.avatarUrl ?? null,
    approval: (approval?.status as Approval) ?? null,
    isAdmin: Boolean(approval?.status === "approved" && approval?.is_admin),
    setupDone: Boolean(profile?.setupDoneAt),
    language: profile?.language ?? null,
    hasPremium: Boolean(profile?.hasLeetcodePremium),
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

/** For admin pages: the same gate as `requireViewer`, then a 404 for anyone who is not an admin. */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  return viewer;
}

/** For admin server actions, which cannot 404: the viewer when they are an admin, otherwise null. */
export async function adminViewer(): Promise<Viewer | null> {
  const viewer = await requireViewer();
  return viewer.isAdmin ? viewer : null;
}
