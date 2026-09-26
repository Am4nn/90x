"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { requireViewer } from "@/lib/auth/viewer";
import { BUDGETS } from "@/lib/setup";
import { setCompanyFocus, setLength, setTemplates, startCampaign } from "@/lib/tracker/campaign";
import { parseTemplates } from "@/lib/tracker/template";

const minutes = z.coerce.number().refine((m) => BUDGETS.some((b) => Number(b.value) === m), "Pick a time");

async function guarded(fn: () => Promise<string | null>, note: string): Promise<FormState> {
  try {
    const error = await fn();
    if (error) return { error };
    revalidatePath("/me/plan");
    revalidatePath("/today");
    return { ok: true, note };
  } catch (e) {
    console.error("plan action failed", e);
    return { error: "Couldn't save that. Try again." };
  }
}

export async function startCampaignAction(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = z
    .object({ length: z.coerce.number().int().min(7).max(365), weekday: minutes, weekend: minutes })
    .safeParse({ length: form.get("length"), weekday: form.get("weekday"), weekend: form.get("weekend") });
  if (!parsed.success) return { error: "Pick a length and your daily time." };
  const { length, weekday, weekend } = parsed.data;
  return guarded(async () => {
    await startCampaign(viewer.id, length, weekday, weekend);
    return null;
  }, "Campaign started. Today is day 1.");
}

export async function setLengthAction(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  return guarded(() => setLength(viewer.id, Number(form.get("length"))), "Length updated.");
}

export async function setTemplatesAction(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  let value: unknown;
  try {
    value = JSON.parse(String(form.get("templates") ?? ""));
  } catch {
    return { error: "Couldn't read the plan. Reload and try again." };
  }
  const parsed = parseTemplates(value);
  if (!parsed.success) return { error: "Every day needs at least one slot, and at most 6 of each." };
  return guarded(() => setTemplates(viewer.id, parsed.data), "Saved. Applies from tomorrow.");
}

export async function setFocusAction(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const company =
    String(form.get("company") ?? "")
      .trim()
      .slice(0, 60) || null;
  const weeks = Math.min(8, Math.max(1, Number(form.get("weeks")) || 1));
  return guarded(() => setCompanyFocus(viewer.id, company, weeks), company ? `Focusing on ${company}.` : "Focus cleared.");
}
