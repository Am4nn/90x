import { createClient as createAdminClient } from "@supabase/supabase-js";
import { eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { profiles, userApprovals } from "@/db/schema";
import { testSignInAllowed } from "@/lib/auth/test-sign-in";
import { createClient } from "@/lib/supabase/server";
import { activeCampaign, startCampaign } from "@/lib/tracker/campaign";
import { SLOT_MINUTES } from "@/lib/tracker/template";

// Test-only sign-in for the Playwright suite: production sign-in is Google only.
// See testSignInAllowed for why this can never answer outside the CI e2e job.

// Only reachable against a throwaway local Supabase, so a shared password is fine.
const PASSWORD = "e2e-local-only-password";
// 95 minutes plans a new problem, a review (a second new problem until one is due)
// and a topic, and no card slot, so a day can be finished without the Feed.
const DAILY_MINUTES = 95;
// cards=1 adds 15 minutes, which the proposed template spends on one "10 cards" slot.
const WITH_CARDS_MINUTES = DAILY_MINUTES + SLOT_MINUTES.cards;
const CAMPAIGN_DAYS = 90;

const Input = z.object({
  email: z.email().endsWith("@e2e.test"),
  admin: z.enum(["1"]).optional(),
  cards: z.enum(["1"]).optional(),
  next: z
    .string()
    .refine((n) => n.startsWith("/") && !n.startsWith("//"))
    .default("/today"),
});

export async function GET(request: NextRequest) {
  const allowed = testSignInAllowed({
    E2E: process.env.E2E,
    VERCEL: process.env.VERCEL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!allowed || !serviceKey) return new NextResponse(null, { status: 404 });

  const params = request.nextUrl.searchParams;
  const parsed = Input.safeParse({
    email: params.get("email"),
    admin: params.get("admin") ?? undefined,
    cards: params.get("cards") ?? undefined,
    next: params.get("next") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Bad email, admin, cards or next." }, { status: 400 });
  const { email, admin, cards, next } = parsed.data;

  const auth = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const created = await auth.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error && created.error.code !== "email_exists") {
    console.error("test sign-in: createUser failed", created.error);
    return NextResponse.json({ error: created.error.message }, { status: 500 });
  }

  // The server client writes the session cookies onto this response.
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.user) {
    console.error("test sign-in: signInWithPassword failed", error);
    return NextResponse.json({ error: error?.message ?? "No user" }, { status: 500 });
  }
  await prepare(data.user.id, email, admin === "1", cards === "1" ? WITH_CARDS_MINUTES : DAILY_MINUTES);
  return NextResponse.redirect(new URL(next, request.url));
}

/** Approved, set up and on a campaign, as if they had been through /pending and /setup. */
async function prepare(userId: string, email: string, isAdmin: boolean, dailyMinutes: number) {
  await db
    .update(userApprovals)
    .set({ status: "approved", isAdmin, decidedAt: sql`coalesce(${userApprovals.decidedAt}, now())` })
    .where(eq(userApprovals.userId, userId));
  const [profile] = await db.select({ setupDoneAt: profiles.setupDoneAt }).from(profiles).where(eq(profiles.userId, userId));
  if (!profile?.setupDoneAt) {
    await db
      .update(profiles)
      .set({ name: email.split("@")[0], role: "backend", language: "python", timezone: "UTC", setupDoneAt: sql`now()` })
      .where(eq(profiles.userId, userId));
  }
  if (!(await activeCampaign(userId))) await startCampaign(userId, CAMPAIGN_DAYS, dailyMinutes, dailyMinutes);
}
