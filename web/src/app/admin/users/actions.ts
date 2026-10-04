"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { db } from "@/db";
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
