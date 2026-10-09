import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { deletedAccounts } from "@/db/schema";
import { type EmailInput, sendEmailBestEffort } from "@/lib/email";
import { accountDeletedByAdminEmail, accountDeletedEmail } from "@/lib/email/templates";
import { forgetInvitesTo } from "@/lib/friends/service";
import { logError } from "@/lib/log";
import { adminClient } from "@/lib/supabase/admin";
import { accountRedisKeys } from "@/lib/trust/account-rules";
import { redis } from "@/lib/upstash/redis";

/** Who deleted the account: the person themselves (Settings) or an admin (/admin/users). */
export type DeletedBy = "self" | "admin";

export type RemoveResult = { ok: true } | { error: string };

const FAILED = "Couldn't delete the account.";

type Person = { email: string | null; name: string | null; created_at: string | null; is_admin: boolean };

/**
 * Deletes one account and everything stored under it. The ONE deletion path: Settings
 * (`deleteAccount`, by "self") and /admin/users (`deleteUser`, by "admin") both call it, after their
 * own checks (who may delete, the typed confirm). It refuses an admin account and a missing one.
 *
 * Almost every table references auth.users with on delete cascade, so removing the auth user
 * removes profile, answers, check-ins, coach chats and memory, Feed state, XP, friendships, sent
 * invites, push subscriptions and reports. The audit columns that name who approved a user or
 * reviewed a card batch, ai_usage, lessons.written_by and app_settings.updated_by are set null by
 * their own rules: the records stay with no person attached (the spend rows are the budget's books).
 *
 * The order, and why:
 *  1. read the email, name and sign-up date (nothing is deleted if the account is gone or an admin);
 *  2. write the deleted_accounts record, so a deletion never happens without one (a retry reuses
 *     the record an earlier attempt left, so an account is never counted twice);
 *  3. remove the invites addressed to their email (keyed by email, so the cascade cannot reach them);
 *  4. delete the auth user. If 3 or 4 fails, the record is taken back and an error returned. An
 *     error from the auth API is checked against auth.users first: if the user is gone anyway (a
 *     reply lost after the delete), the deletion happened, so the record stays and it carries on;
 *  5. clear the person's Redis keys (best effort: the data is gone, a cache blip must not undo it);
 *  6. email the person, only now that it is done: "an admin deleted your account" or "you deleted
 *     your account". The address was read in step 1, so it no longer needs to resolve. Best effort:
 *     a mail failure never undoes a deletion, and a failed deletion sends nothing.
 *
 * `actorId` is the admin who deleted, for the log lines; it defaults to the person.
 * Server only: deleting any account by id must never be reachable from client code.
 */
export async function removeAccount({
  userId,
  by,
  actorId = userId,
}: {
  userId: string;
  by: DeletedBy;
  actorId?: string;
}): Promise<RemoveResult> {
  let person: Person | undefined;
  try {
    const rows = (await db.execute(sql`
      select u.email, nullif(p.name, '') as name, u.created_at::text as created_at, coalesce(a.is_admin, false) as is_admin
      from auth.users u
      left join public.profiles p on p.user_id = u.id
      left join public.user_approvals a on a.user_id = u.id
      where u.id = ${userId}`)) as unknown as Person[];
    person = rows[0];
  } catch (e) {
    logError("account deletion: read failed", e, { userId });
    return { error: FAILED };
  }
  if (!person) return { error: "That account no longer exists." };
  // The only admin deleting themselves would lock everyone out of /admin; that is done by hand.
  if (person.is_admin) return { error: "Admin accounts are removed by hand." };
  const { email } = person;

  let recordId: number;
  try {
    const fields = { email, name: person.name, signedUpAt: person.created_at, deletedBy: by };
    // One record per account (a partial unique index on user_id): a retry after a crash reuses the
    // record it left behind instead of counting the deletion twice.
    const [row] = await db
      .insert(deletedAccounts)
      .values({ userId, ...fields })
      .onConflictDoUpdate({
        target: deletedAccounts.userId,
        targetWhere: sql`user_id is not null`,
        set: { ...fields, deletedAt: sql`now()` },
      })
      .returning({ id: deletedAccounts.id });
    if (!row) throw new Error("deleted_accounts insert returned no row");
    recordId = row.id;
  } catch (e) {
    logError("account deletion: record failed", e, { userId });
    return { error: FAILED };
  }

  const undo = async (step: string, e: unknown): Promise<RemoveResult> => {
    logError(`account deletion failed at ${step}`, e, { userId });
    try {
      await db.delete(deletedAccounts).where(and(eq(deletedAccounts.id, recordId), eq(deletedAccounts.userId, userId)));
    } catch (e2) {
      logError("account deletion: record not taken back", e2, { userId, recordId });
    }
    return { error: FAILED };
  };

  try {
    if (email) await forgetInvitesTo(email);
  } catch (e) {
    return undo("invites", e);
  }

  try {
    const { error } = await adminClient().auth.admin.deleteUser(userId);
    if (error) throw error;
  } catch (e) {
    if (!(await goneAnyway(userId))) return undo("auth", e);
    logError("account deletion: auth API errored but the user is gone, carrying on", e, { userId });
  }

  try {
    await redis().del(...accountRedisKeys(userId));
  } catch (e) {
    logError("account deletion: redis cleanup failed", e);
  }

  if (email) await mail(actorId, userId, by, by === "admin" ? accountDeletedByAdminEmail(email) : accountDeletedEmail(email));

  console.log(JSON.stringify({ evt: "account.deleted", by, actor: actorId, target: userId }));
  return { ok: true };
}

/** After an auth API error: true only when auth.users certainly no longer has the user. A failed check is "not gone". */
async function goneAnyway(userId: string): Promise<boolean> {
  try {
    const rows = (await db.execute(sql`select 1 from auth.users where id = ${userId}`)) as unknown as unknown[];
    return rows.length === 0;
  } catch (e) {
    logError("account deletion: could not check the auth user", e, { userId });
    return false;
  }
}

/** Best effort twice over: sendEmailBestEffort already swallows send failures, and nothing it throws may stop a deletion. */
async function mail(actorId: string, userId: string, by: DeletedBy, email: EmailInput) {
  try {
    await sendEmailBestEffort({
      actorId,
      kind: by === "admin" ? "account-deleted-by-admin" : "account-deleted",
      email,
      payload: { target_id: userId, status: by },
      // The Terms and Privacy policy promise this email, and the deletion has happened either way.
      evenInMaintenance: true,
    });
  } catch (e) {
    logError("account deletion: email failed", e, { userId });
  }
}
