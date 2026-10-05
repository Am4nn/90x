import type { User } from "@supabase/supabase-js";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { userApprovals } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { shouldAutoApprove } from "@/lib/settings-rules";
import { createClient } from "@/lib/supabase/server";

/** Google → Supabase → here with a one-time code, exchanged for a session. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/today";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await fillProfileFromGoogle(supabase, data.user);
      await approveIfOpen(data.user.id);
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }
  return NextResponse.redirect(`${origin}/?error=callback`);
}

/** Accounts created ahead of time (pre-approved by email) start with no name
 *  or avatar; take them from Google on first sign-in without overwriting edits. */
async function fillProfileFromGoogle(supabase: Awaited<ReturnType<typeof createClient>>, user: User) {
  const meta = user.user_metadata ?? {};
  const name = (meta.full_name ?? meta.name ?? "") as string;
  const avatar = (meta.avatar_url ?? null) as string | null;
  const { data: profile } = await supabase.from("profiles").select("name, avatar_url").eq("user_id", user.id).single();
  if (!profile) return;
  const patch: { name?: string; avatar_url?: string } = {};
  if (!profile.name && name) patch.name = name;
  if (!profile.avatar_url && avatar) patch.avatar_url = avatar;
  if (Object.keys(patch).length) await supabase.from("profiles").update(patch).eq("user_id", user.id);
}

/** While the admin has "approve new sign-ins automatically" on, a request still waiting is approved
 *  here, over the server connection. Any failure leaves the person on the pending screen, where a
 *  manual approval still works, so it never blocks the sign-in. */
async function approveIfOpen(userId: string) {
  try {
    const { autoApprove } = await getSettings();
    if (!autoApprove) return;
    const [row] = await db.select({ status: userApprovals.status }).from(userApprovals).where(eq(userApprovals.userId, userId));
    if (!shouldAutoApprove(autoApprove, row?.status)) return;
    // The status test is repeated in the WHERE so a decision made in between is never overwritten.
    await db
      .update(userApprovals)
      .set({ status: "approved", decidedAt: sql`now()` })
      .where(and(eq(userApprovals.userId, userId), eq(userApprovals.status, "pending")));
  } catch (e) {
    console.error("auto-approve failed", e);
  }
}
