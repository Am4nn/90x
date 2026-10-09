"use server";

import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { db } from "@/db";
import { users } from "@/db/auth";
import { userApprovals } from "@/db/schema";
import { removeAccount } from "@/lib/account/remove";
import { adminViewer } from "@/lib/auth/viewer";
import { sendEmailBestEffort } from "@/lib/email";
import { approvalEmail } from "@/lib/email/templates";
import { logError } from "@/lib/log";
import { confirmsEmail } from "@/lib/trust/account-rules";

// Lower case before any comparison: zod's uuid accepts capitals and Postgres compares uuids without
// case, so "A1B2..." would slip a `=== viewer.id` check and still reach the viewer's own row.
const UserId = z.uuid().transform((id) => id.toLowerCase());

const Decision = z.object({ userId: UserId, status: z.enum(["approved", "rejected", "pending"]) });

/**
 * Let in, Block and Unblock, one row at a time. Statuses: "approved" (Let in, Unblock), "rejected"
 * (Block: the UI says Blocked, decided_at is "blocked on"), "pending" (back to Waiting). Never on
 * yourself or another admin: an admin blocked by another could lock the owner out of /admin.
 * adminViewer is the check (the /admin lock in the proxy is a second one): the write goes over the
 * server connection, since the browser roles cannot write user_approvals at all.
 */
export async function decide(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await adminViewer();
  if (!viewer) return { error: "Only admins can do that." };
  const parsed = Decision.safeParse({ userId: form.get("userId"), status: form.get("status") });
  if (!parsed.success || parsed.data.userId === viewer.id) return { error: "That change isn't allowed." };
  const { userId, status } = parsed.data;
  // What it was, so the email below goes only to someone who was waiting; and whether it is an admin.
  const before = (await db.execute(sql`select status, is_admin from public.user_approvals where user_id = ${userId}`)) as unknown as {
    status: string;
    is_admin: boolean;
  }[];
  if (before[0]?.is_admin) return { error: "Admin accounts are changed by hand." };
  const wasPending = before[0]?.status === "pending";
  try {
    await db
      .update(userApprovals)
      .set({
        status,
        decidedAt: status === "pending" ? null : sql`now()`,
        decidedBy: status === "pending" ? null : viewer.id,
      })
      .where(eq(userApprovals.userId, userId));
  } catch (e) {
    logError("approval decision failed", e);
    return { error: "Couldn't save that. Try again." };
  }

  // Only letting a waiting account in sends an email ("You're in"). Blocking sends nothing, and
  // neither does unblocking: an unblocked person already had an account and simply finds it works.
  if (wasPending && status === "approved") {
    // Send email using the server connection to read auth.users.
    const rows = (await db.execute(sql`select email from auth.users where id = ${userId}`)) as unknown as { email: string }[];
    if (rows[0]?.email) {
      await sendEmailBestEffort({
        actorId: viewer.id,
        kind: "approval",
        email: approvalEmail(rows[0].email),
        payload: { target_id: userId, status },
      });
    }
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

const Deletion = z.object({ userId: UserId, confirm: z.string() });

/**
 * Admin Delete on an Active or Blocked row: form fields `userId` and `confirm` (the target's email,
 * typed; case and surrounding spaces are ignored). Refuses yourself, another admin, a missing account
 * and a mismatched email, deleting nothing. Otherwise runs the same deletion as Settings
 * (removeAccount, by "admin"): the person is emailed once the deletion is done, and the row moves to the
 * Deleted section. Returns { ok: true } or { error } with a line to show next to the form.
 */
export async function deleteUser(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await adminViewer();
  if (!viewer) return { error: "Only admins can do that." };
  const parsed = Deletion.safeParse({ userId: form.get("userId"), confirm: form.get("confirm") ?? "" });
  if (!parsed.success || parsed.data.userId === viewer.id) return { error: "That change isn't allowed." };
  const { userId, confirm } = parsed.data;

  const rows = (await db.execute(sql`
    select u.email, coalesce(a.is_admin, false) as is_admin
    from auth.users u left join public.user_approvals a on a.user_id = u.id
    where u.id = ${userId}`)) as unknown as { email: string | null; is_admin: boolean }[];
  const target = rows[0];
  if (!target) return { error: "That account no longer exists." };
  if (target.is_admin) return { error: "Admin accounts are removed by hand." };
  if (!confirmsEmail(confirm, target.email)) return { error: "That email doesn't match this account. Type their email to confirm." };

  const result = await removeAccount({ userId, by: "admin", actorId: viewer.id });
  if ("error" in result) return { error: "Couldn't delete that account. Try again." };
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Let everyone waiting in, once. For the moment auto-approve is switched on, so nobody who signed up
 *  before launch is left on the pending screen. Each person gets the "You're in" email. */
export async function approveAllWaiting(): Promise<FormState> {
  const viewer = await adminViewer();
  if (!viewer) return { error: "Only admins can do that." };
  let ids: string[];
  try {
    const done = await db
      .update(userApprovals)
      .set({ status: "approved", decidedAt: sql`now()`, decidedBy: viewer.id })
      .where(eq(userApprovals.status, "pending"))
      .returning({ userId: userApprovals.userId });
    ids = done.map((r) => r.userId);
  } catch (e) {
    logError("approve all failed", e);
    return { error: "Couldn't let everyone in. Try again." };
  }
  if (ids.length) {
    const rows = await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, ids));
    for (const row of rows) {
      if (!row.email) continue;
      await sendEmailBestEffort({
        actorId: viewer.id,
        kind: "approval",
        email: approvalEmail(row.email),
        payload: { target_id: row.id, status: "approved", bulk: true },
      });
    }
  }
  revalidatePath("/admin/users");
  return { ok: true, note: ids.length === 0 ? "Nobody was waiting." : `Let ${ids.length} ${ids.length === 1 ? "person" : "people"} in.` };
}
