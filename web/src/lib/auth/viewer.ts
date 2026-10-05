import "server-only";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { users } from "@/db/auth";
import { profiles, userApprovals } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { gate } from "./gate";
import { verifiedUserId } from "./session-claims";
import { type Viewer, viewerFromRow } from "./viewer-row";

export type { Viewer } from "./viewer-row";

/**
 * The signed-in user with approval and profile, once per request.
 *
 * The session is verified locally (`getClaims`: the token's ES256 signature against the
 * project's cached JWKS, and its expiry), not by a call to Supabase Auth on every request.
 * The trade-off: a session signed out elsewhere (or a token whose refresh was revoked) stays
 * valid here until its access token expires, at most the JWT expiry (1 hour). What decides
 * access is still read from the database on every request, in one query: a rejected,
 * un-approved, demoted or deleted user is refused on their very next request. See
 * session-claims.ts for exactly what is verified and how each failure ends in "signed out".
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const id = await verifiedUserId(supabase.auth);
  if (!id) return null;
  // Over the server connection, scoped to the verified id: the private profile columns
  // (setup_done_at, language, timezone, ...) are not granted to the authenticated role, and
  // the email lives in auth.users, which only the server connection can read.
  const [row] = await db
    .select({
      email: users.email,
      status: userApprovals.status,
      isAdmin: userApprovals.isAdmin,
      name: profiles.name,
      avatarUrl: profiles.avatarUrl,
      setupDoneAt: profiles.setupDoneAt,
      language: profiles.language,
      hasLeetcodePremium: profiles.hasLeetcodePremium,
      timezone: profiles.timezone,
    })
    .from(users)
    .innerJoin(userApprovals, eq(userApprovals.userId, users.id))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, id));
  return viewerFromRow(id, row);
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
