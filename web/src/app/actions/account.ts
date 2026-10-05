"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { db } from "@/db";
import { batchReviewItems, cardBatches, userApprovals } from "@/db/schema";
import { getViewer } from "@/lib/auth/viewer";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { accountRedisKeys, confirmsDeletion } from "@/lib/trust/account-rules";
import { redis } from "@/lib/upstash/redis";

/**
 * Deletes the signed-in person's account and everything stored under it.
 *
 * Almost every table references auth.users with on delete cascade, so removing the auth user
 * removes profile, answers, check-ins, coach chats and memory, Feed state, XP, friendships, push
 * subscriptions and reports. Three admin-only columns reference it with no rule, which would make
 * the delete fail for someone who had approved or reviewed anything, so they are cleared first.
 * ai_usage, lessons.written_by and app_settings.updated_by are set null by their own rules: the
 * spend rows stay (no person attached), because they are the budget's books.
 */
export async function deleteAccount(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "You are signed out. Sign in again to delete your account." };
  if (!confirmsDeletion(form.get("confirm"))) return { error: "Type DELETE to confirm." };
  // The only admin deleting themselves would lock everyone out of /admin; that is done by hand.
  if (viewer.isAdmin) return { error: "Admin accounts are removed by hand. Email the address on the Delete my account page." };

  try {
    await db.transaction(async (tx) => {
      await tx.update(userApprovals).set({ decidedBy: null }).where(eq(userApprovals.decidedBy, viewer.id));
      await tx.update(cardBatches).set({ reviewedBy: null }).where(eq(cardBatches.reviewedBy, viewer.id));
      await tx.update(batchReviewItems).set({ decidedBy: null }).where(eq(batchReviewItems.decidedBy, viewer.id));
    });
    const { error } = await adminClient().auth.admin.deleteUser(viewer.id);
    if (error) throw error;
  } catch (e) {
    console.error("account deletion failed", viewer.id, e);
    return { error: "Couldn't delete your account. Try again, or email us and we will do it by hand." };
  }

  // The data is gone; what is left is a cache. A Redis blip must not undo the deletion.
  try {
    await redis().del(...accountRedisKeys(viewer.id));
  } catch (e) {
    console.error("account deletion: redis cleanup failed", e);
  }

  // The session cookie still names a user that no longer exists. Clear it here.
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/?deleted=1");
}
