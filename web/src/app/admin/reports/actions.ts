"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { db } from "@/db";
import { problemReports } from "@/db/schema";
import { adminViewer } from "@/lib/auth/viewer";
import { logError } from "@/lib/log";

const Input = z.object({ id: z.uuid(), resolved: z.boolean() });

/** Marks a report resolved, or open again. */
export async function setResolved(id: string, resolved: boolean): Promise<FormState> {
  const viewer = await adminViewer();
  if (!viewer) return { error: "Only admins can do that." };
  const parsed = Input.safeParse({ id, resolved });
  if (!parsed.success) return { error: "That report isn't valid." };
  try {
    const done = await db
      .update(problemReports)
      .set(parsed.data.resolved ? { resolvedAt: new Date().toISOString(), resolvedBy: viewer.id } : { resolvedAt: null, resolvedBy: null })
      .where(eq(problemReports.id, parsed.data.id))
      .returning({ id: problemReports.id });
    if (done.length === 0) return { error: "That report no longer exists." };
    revalidatePath("/admin/reports");
    return { ok: true };
  } catch (e) {
    logError("setResolved failed", e);
    return { error: "Couldn't save that. Try again." };
  }
}
