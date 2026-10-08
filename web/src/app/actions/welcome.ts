"use server";

import { requireViewer } from "@/lib/auth/viewer";
import { logError } from "@/lib/log";
import { markWelcomeSeen } from "@/lib/tracker/welcome-queries";

/** The welcome closed (held through or skipped). A failure only means it shows once more. */
export async function welcomeSeenAction(): Promise<void> {
  const viewer = await requireViewer();
  try {
    await markWelcomeSeen(viewer.id);
  } catch (e) {
    logError("welcome: marking it seen failed", e);
  }
}
