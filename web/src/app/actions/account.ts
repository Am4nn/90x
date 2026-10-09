"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { removeAccount } from "@/lib/account/remove";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { confirmsDeletion } from "@/lib/trust/account-rules";

/**
 * Deletes the signed-in person's account and everything stored under it, through the one deletion
 * path (removeAccount, by "self"): a deleted_accounts record, the invites addressed to them, the auth
 * user and its cascade, their Redis keys, then the "you deleted your account" email.
 */
export async function deleteAccount(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "You are signed out. Sign in again to delete your account." };
  if (!confirmsDeletion(form.get("confirm"))) return { error: "Type DELETE to confirm." };
  // The only admin deleting themselves would lock everyone out of /admin; that is done by hand.
  if (viewer.isAdmin) return { error: "Admin accounts are removed by hand. Email the address on the Delete my account page." };

  const result = await removeAccount({ userId: viewer.id, by: "self" });
  if ("error" in result) return { error: "Couldn't delete your account. Try again, or email us and we will do it by hand." };

  // The session cookie still names a user that no longer exists. Clear it here.
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/?deleted=1");
}
