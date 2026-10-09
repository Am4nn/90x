"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireViewer } from "@/lib/auth/viewer";
import { logError } from "@/lib/log";
import { BUDGETS } from "@/lib/setup";
import { setCompanyFocus, setLength, setLevel, setTemplates, setWeek, startCampaign } from "@/lib/tracker/campaign";
import { MAX_FOCUS_COMPANIES, cleanCompanies } from "@/lib/tracker/campaign-rules";
import { LEVEL_VALUES, asLevel } from "@/lib/tracker/level";
import { parseTemplates } from "@/lib/tracker/template";

const minutes = z.coerce.number().refine((m) => BUDGETS.some((b) => Number(b.value) === m), "Pick a time");
const level = z.enum(LEVEL_VALUES);

async function guarded(fn: () => Promise<string | null>, note: string): Promise<FormState> {
  try {
    const error = await fn();
    if (error) return { error };
    revalidatePath("/me/plan");
    revalidatePath("/today");
    return { ok: true, note };
  } catch (e) {
    logError("plan action failed", e);
    return { error: "Couldn't save that. Try again." };
  }
}

export async function startCampaignAction(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = z
    .object({
      length: z.coerce.number().int().min(7).max(365),
      weekday: minutes,
      weekend: minutes,
      // Optional so a form from before levels existed still starts a plan; a
      // missing level leaves the profile's own alone, which is null for most.
      level: level.optional(),
    })
    .safeParse({ length: form.get("length"), weekday: form.get("weekday"), weekend: form.get("weekend"), level: form.get("level") });
  if (!parsed.success) return { error: "Pick a length and your daily time." };
  const { length, weekday, weekend, level: chosen } = parsed.data;
  return guarded(async () => {
    await startCampaign(viewer.id, length, weekday, weekend, chosen);
    return null;
  }, "Plan started. Today is day 1.");
}

export async function setLevelAction(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = level.safeParse(form.get("level"));
  if (!parsed.success) return { error: "Pick a level." };
  return guarded(() => setLevel(viewer.id, parsed.data), "Level saved.");
}

/** Rebuild the week from the times chosen now. The level is read from the
 *  profile rather than posted: it decides the mix, and a level someone changed
 *  but did not save must not change the week behind their back. */
export async function setWeekAction(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = z
    .object({ weekday: minutes, weekend: minutes, level: level.optional() })
    .safeParse({ weekday: form.get("weekday"), weekend: form.get("weekend"), level: form.get("level") });
  if (!parsed.success) return { error: "Pick a time for a weekday and the weekend." };
  return guarded(async () => {
    // Rebuild with the level the preview is showing, so what the reader previews
    // is what they get; an old client that posts no level falls back to the
    // saved one.
    if (parsed.data.level) return setWeek(viewer.id, parsed.data.weekday, parsed.data.weekend, parsed.data.level);
    const [profile] = await db.select({ level: profiles.level }).from(profiles).where(eq(profiles.userId, viewer.id));
    return setWeek(viewer.id, parsed.data.weekday, parsed.data.weekend, asLevel(profile?.level));
  }, "Week rebuilt from your times.");
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
  const names = form.getAll("company").map(String);
  if (names.length > MAX_FOCUS_COMPANIES * 3) return { error: `Pick at most ${MAX_FOCUS_COMPANIES} companies.` };
  if (names.some((n) => n.trim().length > 60)) return { error: "Company names are at most 60 characters." };
  const companies = cleanCompanies(names);
  if (companies.length > MAX_FOCUS_COMPANIES) return { error: `Pick at most ${MAX_FOCUS_COMPANIES} companies.` };
  const rawWeeks = Number(form.get("weeks"));
  if (form.get("weeks") !== null && !Number.isFinite(rawWeeks)) return { error: "Pick 1, 2 or 4 weeks." };
  const weeks = Math.min(8, Math.max(1, Math.round(rawWeeks) || 1));
  return guarded(
    () => setCompanyFocus(viewer.id, companies, weeks),
    companies.length ? `Focusing on ${companies.join(", ")}.` : "Focus cleared.",
  );
}
