"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { checkinNotes, checkins } from "@/db/schema";
import { requireViewer } from "@/lib/auth/viewer";
import { parseCheckin } from "@/lib/library/checkin";
import { notifyFriends } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";
import { onCheckins } from "@/lib/tracker/service";

/** `xp` and `bonus` are what the check-in earned (see XpGain). */
export type CheckinState = { ok?: boolean; error?: string; checkinId?: string; xp?: number; bonus?: number };

/** Written over the server connection for the viewer requireViewer verified (signed in and approved, which is
 *  what the row policy used to check), so it is always their own check-in; the Data API cannot insert one. */
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
  const [row] = await db
    .insert(checkins)
    .values({ userId, problemSlug, result, minutes, source: "manual" })
    .returning({ id: checkins.id, createdAt: checkins.createdAt });
  if (!row) return { error: "Couldn't save the check-in. Try again." };
  // As before, a note that fails to save does not fail the check-in (a retry would duplicate it).
  if (note)
    await db
      .insert(checkinNotes)
      .values({ checkinId: row.id, userId, note })
      .catch((e: unknown) => console.error("check-in note not saved", e));
  const supabase = await createClient();
  // The check-in is saved; ticking missions must not turn that into an error (a retry would duplicate it).
  const gain = await onCheckins(userId, [{ slug: problemSlug, result, createdAt: row.createdAt, checkinId: row.id }]).catch((e) => {
    console.error("tracker: ticking after check-in failed", e);
    return null;
  });
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
  return { ok: true, checkinId: row.id, ...(gain ? { xp: gain.xp, bonus: gain.bonus } : {}) };
}
