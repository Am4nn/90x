"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth/viewer";
import { parseCheckin } from "@/lib/library/checkin";
import { createClient } from "@/lib/supabase/server";

export type CheckinState = { ok?: boolean; error?: string };

/** Written as the signed-in user, so RLS guarantees it's their own check-in. */
export async function checkIn(_: CheckinState, form: FormData): Promise<CheckinState> {
  const viewer = await requireViewer();
  const parsed = parseCheckin(form);
  if (!parsed.success) return { error: "Pick how it went." };
  const { problemSlug, result, minutes, note } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("checkins")
    .insert({ user_id: viewer.id, problem_slug: problemSlug, result, minutes, source: "manual" })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't save the check-in. Try again." };
  if (note) await supabase.from("checkin_notes").insert({ checkin_id: data.id, user_id: viewer.id, note });
  revalidatePath(`/library/problem/${problemSlug}`);
  revalidatePath("/library");
  return { ok: true };
}
