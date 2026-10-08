"use server";

import { requireViewer } from "@/lib/auth/viewer";
import { logError } from "@/lib/log";
import { cardVersion } from "@/lib/share/link";
import { countShared, getOrCreateShareCode, shareSummary } from "@/lib/share/service";
import { takeDailyCount } from "@/lib/upstash/rate-limit";

export type ShareCodeState = { ok: true; code: string; version: string | null } | { ok?: false; error: string };

/** The viewer's share code (made on first use) and the card's current version, from the same model the
 *  public card route checks `?v=` against (null with no active campaign). Never throws to the UI. */
export async function shareCodeAction(): Promise<ShareCodeState> {
  const viewer = await requireViewer();
  try {
    const [code, model] = await Promise.all([getOrCreateShareCode(viewer.id), shareSummary(viewer.id)]);
    return { ok: true, code, version: model ? cardVersion(model) : null };
  } catch (e) {
    logError("share code failed", e);
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
    logError("share count not saved", e);
  }
}
