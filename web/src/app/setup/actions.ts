"use server";

import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth/viewer";
import { parseSetup } from "@/lib/setup";
import { createClient } from "@/lib/supabase/server";

export type SetupState = { errors?: Record<string, string>; message?: string };

export async function saveSetup(_: SetupState, form: FormData): Promise<SetupState> {
  const viewer = await requireViewer({ allowSetup: true });
  const parsed = parseSetup(form);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ ...parsed.data, setup_done_at: new Date().toISOString() })
    .eq("user_id", viewer.id);
  if (error) return { message: "Couldn't save your setup. Try again." };
  redirect("/today");
}
