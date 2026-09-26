"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

const Decision = z.object({ userId: z.uuid(), status: z.enum(["approved", "rejected", "pending"]) });

/** Row-level security also checks is_admin(), so a non-admin can't decide
 *  even if they reach this action. */
export async function decide(form: FormData) {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) return;
  const parsed = Decision.safeParse({ userId: form.get("userId"), status: form.get("status") });
  if (!parsed.success || parsed.data.userId === viewer.id) return;
  const { userId, status } = parsed.data;
  const supabase = await createClient();
  await supabase
    .from("user_approvals")
    .update({
      status,
      decided_at: status === "pending" ? null : new Date().toISOString(),
      decided_by: status === "pending" ? null : viewer.id,
    })
    .eq("user_id", userId);
  revalidatePath("/admin/users");
}
