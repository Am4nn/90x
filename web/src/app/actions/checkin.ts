"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth/viewer";
import { parseCheckin } from "@/lib/library/checkin";
import { createClient } from "@/lib/supabase/server";
import { onCheckins } from "@/lib/tracker/service";

export type CheckinState = { ok?: boolean; error?: string };

/** Written as the signed-in user, so RLS guarantees it's their own check-in. */
export async function checkIn(_: CheckinState, form: FormData): Promise<CheckinState> {
  const viewer = await requireViewer();
  const parsed = parseCheckin(form);
  if (!parsed.success) return { error: "Pick how it went." };
  const { problemSlug, result, minutes, note } = parsed.data;
  try {
    return await save(viewer.id, problemSlug, result, minutes, note);
  } catch (e) {
    console.error("checkIn failed", e);
    return { error: "Couldn't save the check-in. Try again." };
  }
}

async function save(userId: string, problemSlug: string, result: "solved" | "hints" | "failed", minutes: number | null, note: string | null): Promise<CheckinState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("checkins")
    .insert({ user_id: userId, problem_slug: problemSlug, result, minutes, source: "manual" })
    .select("id, created_at")
    .single();
  if (error || !data) return { error: "Couldn't save the check-in. Try again." };
  if (note) await supabase.from("checkin_notes").insert({ checkin_id: data.id, user_id: userId, note });
  await onCheckins(userId, [{ slug: problemSlug, result, createdAt: data.created_at, checkinId: data.id }]);
  revalidatePath("/today");
  revalidatePath(`/library/problem/${problemSlug}`);
  revalidatePath("/library");
  return { ok: true };
}
