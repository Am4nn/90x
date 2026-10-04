"use server";

import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { db } from "@/db";
import { users } from "@/db/auth";
import { userApprovals } from "@/db/schema";
import { adminViewer } from "@/lib/auth/viewer";
import { sendEmailBestEffort } from "@/lib/email";
import { approvalEmail } from "@/lib/email/templates";
import { createClient } from "@/lib/supabase/server";

const Decision = z.object({ userId: z.uuid(), status: z.enum(["approved", "rejected", "pending"]) });

/** Row-level security also checks is_admin(), so a non-admin can't decide
 *  even if they reach this action. */
export async function decide(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await adminViewer();
  if (!viewer) return { error: "Only admins can do that." };
  const parsed = Decision.safeParse({ userId: form.get("userId"), status: form.get("status") });
  if (!parsed.success || parsed.data.userId === viewer.id) return { error: "That change isn't allowed." };
  const { userId, status } = parsed.data;
  // What it was, so the email below can tell a decision from a revocation.
  const before = (await db.execute(sql`select status from public.user_approvals where user_id = ${userId}`)) as unknown as {
    status: string;
  }[];
  const wasPending = before[0]?.status === "pending";
  const unchanged = before[0]?.status === status;
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_approvals")
    .update({
      status,
      decided_at: status === "pending" ? null : new Date().toISOString(),
      decided_by: status === "pending" ? null : viewer.id,
    })
    .eq("user_id", userId);
  if (error) return { error: "Couldn't save that. Try again." };

  // Only a decision on a request gets an email, and only when something actually
  // changed. The Revoke button on an approved account submits "rejected", so
  // without the wasPending test it told somebody with a long-standing account
  // that their *request* was declined - and re-pressing the same button sent it
  // again. Revoking deserves its own wording; until that exists it sends nothing
  // rather than the wrong thing.
  if (status !== "pending" && wasPending && !unchanged) {
    // Send email using the server connection to read auth.users.
    const rows = (await db.execute(sql`select email from auth.users where id = ${userId}`)) as unknown as { email: string }[];
    if (rows[0]?.email) {
      await sendEmailBestEffort({
        actorId: viewer.id,
        kind: "approval",
        email: approvalEmail(rows[0].email, status === "approved"),
        payload: { target_id: userId, status },
      });
    }
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

/** Approve everyone waiting, once. For the moment auto-approve is switched on, so nobody who signed up
 *  before launch is left on the pending screen. Each person gets the usual approval email. */
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
    console.error("approve all failed", e);
    return { error: "Couldn't approve everyone. Try again." };
  }
  if (ids.length) {
    const rows = await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, ids));
    for (const row of rows) {
      if (!row.email) continue;
      await sendEmailBestEffort({
        actorId: viewer.id,
        kind: "approval",
        email: approvalEmail(row.email, true),
        payload: { target_id: row.id, status: "approved", bulk: true },
      });
    }
  }
  revalidatePath("/admin/users");
  return { ok: true, note: ids.length === 0 ? "Nobody was waiting." : `Approved ${ids.length} ${ids.length === 1 ? "person" : "people"}.` };
}
