"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form";
import { adminViewer } from "@/lib/auth/viewer";
import { logError } from "@/lib/log";
import { reapplyMaintenance as reapply, saveMaintenance, saveSettings } from "@/lib/settings";
import { MaintenanceInput, SettingsInput } from "@/lib/settings-rules";

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
    logError("settings not saved", e);
    return { error: "Couldn't save that. Try again." };
  }
  revalidatePath("/admin/settings");
  return { ok: true, note: "Saved." };
}

/** The maintenance switch and message: their own form, so no other save can change them. */
export async function setMaintenance(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await adminViewer();
  if (!viewer) return { error: "Only admins can do that." };
  const parsed = MaintenanceInput.safeParse({
    maintenance: form.get("maintenance") === "on",
    maintenanceMessage: String(form.get("maintenanceMessage") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "That isn't valid." };
  let mirrored: boolean;
  try {
    ({ mirrored } = await saveMaintenance({ on: parsed.data.maintenance, message: parsed.data.maintenanceMessage }, viewer.id));
  } catch (e) {
    logError("maintenance not saved", e);
    return { error: "Couldn't save that. Try again." };
  }
  revalidatePath("/admin/settings");
  if (!mirrored) return { error: "Saved, but the app didn't switch over. Use Re-apply." };
  return { ok: true, note: "Saved." };
}

/** Sends the stored switch to the app again, when what the app obeys differs from what is stored. */
export async function reapplyMaintenance(): Promise<FormState> {
  const viewer = await adminViewer();
  if (!viewer) return { error: "Only admins can do that." };
  const { mirrored } = await reapply();
  revalidatePath("/admin/settings");
  return mirrored ? { ok: true, note: "Re-applied." } : { error: "Couldn't reach the app's switch. Try again." };
}
