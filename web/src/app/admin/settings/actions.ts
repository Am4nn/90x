"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form";
import { adminViewer } from "@/lib/auth/viewer";
import { saveSettings } from "@/lib/settings";
import { SettingsInput } from "@/lib/settings-rules";

/** The settings form. An unchecked box is absent from the form, so it reads as off. */
export async function updateSettings(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await adminViewer();
  if (!viewer) return { error: "Only admins can do that." };
  const parsed = SettingsInput.safeParse({
    autoApprove: form.get("autoApprove") === "on",
    aiDailyCapUsd: Number(form.get("aiDailyCapUsd")),
    aiMonthlyCapUsd: Number(form.get("aiMonthlyCapUsd")),
    aiUserDailyCapUsd: Number(form.get("aiUserDailyCapUsd")),
    aiLifetimeCapUsd: Number(form.get("aiLifetimeCapUsd")),
    aiHardStop: form.get("aiHardStop") === "on",
    aiPaused: form.get("aiPaused") === "on",
    launchDate: String(form.get("launchDate") ?? "").trim() || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Those settings aren't valid." };
  try {
    await saveSettings(parsed.data, viewer.id);
  } catch (e) {
    console.error("settings not saved", e);
    return { error: "Couldn't save that. Try again." };
  }
  revalidatePath("/admin/settings");
  return { ok: true, note: "Saved." };
}
