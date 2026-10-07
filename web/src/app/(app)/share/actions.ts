"use server";

import type { FormState } from "@/components/form";
import { requireViewer } from "@/lib/auth/viewer";
import { countShared, getOrCreateShareCode } from "@/lib/share/service";
import { takeDailyCount } from "@/lib/upstash/rate-limit";

/** The viewer's share code (made on first use), in `note`. Never throws to the UI. */
export async function shareCodeAction(): Promise<FormState> {
  const viewer = await requireViewer();
  try {
    return { ok: true, note: await getOrCreateShareCode(viewer.id) };
  } catch (e) {
    console.error("share code failed", e);
    return { error: "Could not make your share link. Try again." };
  }
}

/** The share row calls this once a share sheet, a copy or a download went through: one more "times shared" on
 *  admin Analytics. At most 10 a day per person; past that, or with Redis down, it is simply not counted. Silent. */
export async function shareCountedAction(): Promise<void> {
  const viewer = await requireViewer();
  try {
    if (await takeDailyCount(viewer.id, "shareCount")) await countShared(viewer.id);
  } catch (e) {
    console.error("share count not saved", e);
  }
}
