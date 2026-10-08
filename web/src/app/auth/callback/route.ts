import type { User } from "@supabase/supabase-js";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { profiles, userApprovals } from "@/db/schema";
import { decodeAttribution, SOURCE_COOKIE } from "@/lib/analytics/source";
import { safeNext } from "@/lib/auth/next-path";
import { getSettings } from "@/lib/settings";
import { shouldAutoApprove } from "@/lib/settings-rules";
import { createClient } from "@/lib/supabase/server";

/** Google → Supabase → here with a one-time code, exchanged for a session. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await fillProfileFromGoogle(supabase, data.user);
      await recordSignupSource(data.user.id);
      await approveIfOpen(data.user.id);
      return NextResponse.redirect(`${origin}${next}`);
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

/** Copies the visitor's first-touch source (set by the proxy) onto a brand-new profile, once, then drops the cookie.
 *  A profile older than a day, or one that already has a source, is left alone, so a later campaign link
 *  cannot rewrite where someone came from. No cookie on a new profile means they typed the address: 'direct'.
 *  Never blocks the sign-in. */
async function recordSignupSource(userId: string) {
  try {
    const jar = await cookies();
    const found = decodeAttribution(jar.get(SOURCE_COOKIE)?.value);
    jar.delete(SOURCE_COOKIE);
    await db
      .update(profiles)
      .set({
        signupSource: found?.source ?? "direct",
        signupMedium: found?.medium ?? null,
        signupCampaign: found?.campaign ?? null,
        signupReferrer: found?.referrer ?? null,
      })
      .where(and(eq(profiles.userId, userId), isNull(profiles.signupSource), gt(profiles.createdAt, sql`now() - interval '1 day'`)));
  } catch (e) {
    console.error("signup source not recorded", e);
  }
}
