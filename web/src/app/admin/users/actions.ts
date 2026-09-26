"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/viewer";
import type { FormState } from "@/components/form";
import { createClient } from "@/lib/supabase/server";

const Decision = z.object({ userId: z.uuid(), status: z.enum(["approved", "rejected", "pending"]) });

/** Row-level security also checks is_admin(), so a non-admin can't decide
 *  even if they reach this action. */
export async function decide(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) return { error: "Only admins can do that." };
  const parsed = Decision.safeParse({ userId: form.get("userId"), status: form.get("status") });
  if (!parsed.success || parsed.data.userId === viewer.id) return { error: "That change isn't allowed." };
  const { userId, status } = parsed.data;
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
  revalidatePath("/admin/users");
  return { ok: true };
}
