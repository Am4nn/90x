"use server";

import { requireViewer } from "@/lib/auth/viewer";
import { logError } from "@/lib/log";
import { TIP_IDS } from "@/lib/tips";
import { markTipsSeen } from "@/lib/tracker/welcome-queries";

/** Demo steps seen (Next, Skip, Done, Listen to one, Escape). A failure only means a step may show again. */
export async function tipsSeenAction(ids: string[]): Promise<void> {
  const viewer = await requireViewer();
  const known = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && TIP_IDS.has(id)) : [];
  try {
    await markTipsSeen(viewer.id, known);
  } catch (e) {
    logError("tips: marking seen failed", e);
  }
}
