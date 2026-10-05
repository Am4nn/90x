import type { Approval } from "./gate";

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

/** The viewer's own rows, read in one query: auth.users, joined to user_approvals and profiles. */
export type ViewerRow = {
  email: string | null;
  status: string;
  isAdmin: boolean;
  name: string | null;
  avatarUrl: string | null;
  setupDoneAt: string | null;
  language: string | null;
  hasLeetcodePremium: boolean | null;
  timezone: string | null;
};

/**
 * The viewer for a verified user id and the row the database has for them.
 *
 * No row means the account is gone: every auth user gets an approval row from the
 * sign-up trigger, and both cascade from auth.users, so a token that outlives its
 * account (deleted within the token's hour) is treated as signed out, as Auth would.
 * Approval and admin come from the row, never from the token.
 */
export function viewerFromRow(id: string, row: ViewerRow | undefined): Viewer | null {
  if (!row) return null;
  return {
    id,
    email: row.email ?? null,
    name: row.name || row.email || "",
    avatarUrl: row.avatarUrl ?? null,
    approval: (row.status as Approval) ?? null,
    isAdmin: Boolean(row.status === "approved" && row.isAdmin),
    setupDone: Boolean(row.setupDoneAt),
    language: row.language ?? null,
    hasPremium: Boolean(row.hasLeetcodePremium),
    timezone: row.timezone ?? "UTC",
  };
}
