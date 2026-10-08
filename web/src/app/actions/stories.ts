"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { requireViewer } from "@/lib/auth/viewer";
import { deleteStory, saveStory } from "@/lib/coach/stories";
import { StorySchema } from "@/lib/coach/story-rules";
import { logError } from "@/lib/log";

const Id = z.uuid().nullable();

export async function saveStoryAction(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const id = Id.safeParse(form.get("id") || null);
  const parsed = StorySchema.safeParse({
    title: form.get("title"),
    situation: form.get("situation") ?? "",
    task: form.get("task") ?? "",
    action: form.get("action") ?? "",
    result: form.get("result") ?? "",
    tags: form.getAll("tags"),
  });
  if (!id.success) return { error: "That story doesn't exist." };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the fields and try again." };
  try {
    if (!(await saveStory(viewer.id, id.data, parsed.data))) return { error: "That story doesn't exist." };
    revalidatePath("/me/stories");
    return { ok: true, note: "Saved." };
  } catch (e) {
    logError("saveStoryAction failed", e);
    return { error: "Couldn't save the story. Try again." };
  }
}

export async function deleteStoryAction(storyId: string): Promise<FormState> {
  const viewer = await requireViewer();
  const id = z.uuid().safeParse(storyId);
  if (!id.success) return { error: "That story doesn't exist." };
  try {
    await deleteStory(viewer.id, id.data);
    revalidatePath("/me/stories");
    return { ok: true };
  } catch (e) {
    logError("deleteStoryAction failed", e);
    return { error: "Couldn't delete the story. Try again." };
  }
}
