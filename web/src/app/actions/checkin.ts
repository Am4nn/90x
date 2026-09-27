"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth/viewer";
import { parseCheckin } from "@/lib/library/checkin";
import { notifyFriends } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";
import { onCheckins } from "@/lib/tracker/service";

export type CheckinState = { ok?: boolean; error?: string; checkinId?: string };

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

async function save(
  userId: string,
  problemSlug: string,
  result: "solved" | "hints" | "failed",
  minutes: number | null,
  note: string | null,
): Promise<CheckinState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("checkins")
    .insert({ user_id: userId, problem_slug: problemSlug, result, minutes, source: "manual" })
    .select("id, created_at")
    .single();
  if (error || !data) return { error: "Couldn't save the check-in. Try again." };
  if (note) await supabase.from("checkin_notes").insert({ checkin_id: data.id, user_id: userId, note });
  // The check-in is saved; ticking missions must not turn that into an error (a retry would duplicate it).
  await onCheckins(userId, [{ slug: problemSlug, result, createdAt: data.created_at, checkinId: data.id }]).catch((e) =>
    console.error("tracker: ticking after check-in failed", e),
  );
  // Friends who opted in hear about it; a push failure never fails the check-in.
  const verb = result === "solved" ? "Solved" : result === "hints" ? "Solved with hints" : "Attempted";
  const [{ data: me }, { data: problem }] = await Promise.all([
    supabase.from("profiles").select("name").eq("user_id", userId).single(),
    supabase.from("problems").select("title").eq("slug", problemSlug).single(),
  ]);
  await notifyFriends(
    userId,
    me?.name?.split(" ")[0] || "A friend",
    `${verb} ${problem?.title ?? problemSlug}`,
    `/library/problem/${problemSlug}`,
  ).catch((e) => console.error("friend push failed", e));
  revalidatePath("/today");
  revalidatePath(`/library/problem/${problemSlug}`);
  revalidatePath("/library");
  return { ok: true, checkinId: data.id };
}
