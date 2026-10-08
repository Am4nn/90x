"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { requireViewer } from "@/lib/auth/viewer";
import { MOCK_TYPES, mockThreadHref } from "@/lib/coach/mock-rules";
import { endMock, startMock } from "@/lib/coach/mocks";
import { listStories } from "@/lib/coach/stories";
import { logError } from "@/lib/log";

const Start = z.object({ type: z.enum(MOCK_TYPES), topic: z.string().min(1).max(200) });

/** Starts a mock and opens its thread in the coach chat. */
export async function startMockAction(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = Start.safeParse({ type: form.get("type"), topic: form.get("topic") });
  if (!parsed.success) return { error: "Pick a topic first." };
  const { type, topic } = parsed.data;
  let href: string;
  try {
    if (type === "behavioral" && !(await listStories(viewer.id)).length) {
      return { error: "Add at least one story first; the interviewer uses them." };
    }
    const started = await startMock(viewer.id, type, topic);
    if ("error" in started) return { error: started.error };
    href = mockThreadHref(started.mockId, started.threadId);
  } catch (e) {
    logError("startMockAction failed", e);
    return { error: "Couldn't start the mock. Try again." };
  }
  revalidatePath("/coach/mocks");
  redirect(href);
}

/** Ends and scores a mock (the End button, the timer, or confirming the interviewer's end_mock). */
export async function endMockAction(mockId: string): Promise<FormState> {
  const viewer = await requireViewer();
  const id = z.uuid().safeParse(mockId);
  if (!id.success) return { error: "That mock doesn't exist." };
  try {
    const result = await endMock(viewer.id, id.data);
    if ("error" in result) return { error: result.error };
    revalidatePath("/coach/mocks");
    revalidatePath(`/coach/mocks/${id.data}`);
    revalidatePath("/me");
    return { ok: true, note: result.scored ? "Scored." : "Ended without answers, so there's no score." };
  } catch (e) {
    logError("endMockAction failed", e);
    return { error: "Couldn't score the mock. Try ending it again." };
  }
}
