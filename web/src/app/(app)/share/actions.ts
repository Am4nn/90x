"use server";

import type { FormState } from "@/components/form";
import { requireViewer } from "@/lib/auth/viewer";
import { getOrCreateShareCode } from "@/lib/share/service";

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
