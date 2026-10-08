import { createClient as createAdminClient } from "@supabase/supabase-js";
import { and, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, cardReviews, cards, missions, profiles, userApprovals } from "@/db/schema";
import { isSafeNext } from "@/lib/auth/next-path";
import { testSignInAllowed } from "@/lib/auth/test-sign-in";
import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { activeCampaign, startCampaign } from "@/lib/tracker/campaign";
import { addDays, localDate } from "@/lib/tracker/dates";
import { SLOT_MINUTES } from "@/lib/tracker/template";

// Test-only sign-in for the Playwright suite: production sign-in is Google only.
// See testSignInAllowed for why this can never answer outside the CI e2e job.

// Only reachable against a throwaway local Supabase, so a shared password is fine.
const PASSWORD = "e2e-local-only-password";
// 95 minutes is a new problem, a review (a second new problem until one is due)
// and a topic, plus the 15 every day's "10 cards" mission takes out of the budget.
const DAILY_MINUTES = 95 + SLOT_MINUTES.cards;
const CAMPAIGN_DAYS = 90;

const Input = z.object({
  email: z.email().endsWith("@e2e.test"),
  admin: z.enum(["1"]).optional(),
  /** Keeps today's "10 cards" mission open. Without it the mission is skipped, so a day can be finished without the Feed. */
  cards: z.enum(["1"]).optional(),
  /** Leaves Setup undone, so a spec can walk /setup itself. */
  setup: z.enum(["1"]).optional(),
  /** Starts the plan two days ago, so Today closes both days as missed and offers to revive them. */
  missed: z.enum(["1"]).optional(),
  /** Gives the user this many answered cards today, so the Feed's "missions are waiting" banner is due. */
  answered: z.coerce.number().int().min(1).max(100).optional(),
  /** Shows the first-run welcome on Today. Without it the welcome counts as seen, so it covers nothing. */
  welcome: z.enum(["1"]).optional(),
  next: z.string().refine(isSafeNext).default("/today"),
});

export async function GET(request: NextRequest) {
  const allowed = testSignInAllowed({
    E2E: process.env.E2E,
    VERCEL: process.env.VERCEL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    ALLOW_TEST_SIGN_IN: process.env.ALLOW_TEST_SIGN_IN,
  });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!allowed || !serviceKey) return new NextResponse(null, { status: 404 });

  const params = request.nextUrl.searchParams;
  const parsed = Input.safeParse({
    email: params.get("email"),
    admin: params.get("admin") ?? undefined,
    cards: params.get("cards") ?? undefined,
    setup: params.get("setup") ?? undefined,
    missed: params.get("missed") ?? undefined,
    answered: params.get("answered") ?? undefined,
    welcome: params.get("welcome") ?? undefined,
    next: params.get("next") ?? undefined,
  });
  if (!parsed.success)
    return NextResponse.json({ error: "Bad email, admin, cards, setup, missed, answered, welcome or next." }, { status: 400 });
  const { email, admin, cards: keepCards, setup, missed, answered, welcome, next } = parsed.data;

  const auth = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const created = await auth.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error && created.error.code !== "email_exists") {
    logError("test sign-in: createUser failed", created.error);
    return NextResponse.json({ error: created.error.message }, { status: 500 });
  }

  // The server client writes the session cookies onto this response.
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.user) {
    logError("test sign-in: signInWithPassword failed", error);
    return NextResponse.json({ error: error?.message ?? "No user" }, { status: 500 });
  }
  await prepare(data.user.id, email, admin === "1", keepCards === "1", setup !== "1");
  if (missed === "1") await backdate(data.user.id);
  if (answered) await answerCards(data.user.id, answered);
  await db
    .update(profiles)
    .set({ welcomeSeenAt: welcome === "1" ? null : sql`coalesce(${profiles.welcomeSeenAt}, now())` })
    .where(eq(profiles.userId, data.user.id));
  return NextResponse.redirect(new URL(next, request.url));
}

/** Approved, set up and on a campaign, as if they had been through /pending and /setup. */
async function prepare(userId: string, email: string, isAdmin: boolean, keepCards: boolean, setUp: boolean) {
  await db
    .update(userApprovals)
    .set({ status: "approved", isAdmin, decidedAt: sql`coalesce(${userApprovals.decidedAt}, now())` })
    .where(eq(userApprovals.userId, userId));
  const [profile] = await db.select({ setupDoneAt: profiles.setupDoneAt }).from(profiles).where(eq(profiles.userId, userId));
  if (!profile?.setupDoneAt) {
    await db
      .update(profiles)
      .set({
        name: email.split("@")[0],
        role: "backend",
        language: "python",
        timezone: "UTC",
        ...(setUp ? { setupDoneAt: sql`now()` } : {}),
      })
      .where(eq(profiles.userId, userId));
  }
  if (!(await activeCampaign(userId))) await startCampaign(userId, CAMPAIGN_DAYS, DAILY_MINUTES, DAILY_MINUTES);
  // Every day has a "10 cards" mission and the e2e database has live cards, so it
  // would be open and need ten Feed answers before a day could finish. Plant
  // today's as skipped before Today plans (the planner's insert then conflicts
  // and keeps this one), unless the spec is about cards.
  if (!keepCards) {
    await db
      .insert(missions)
      .values({
        userId,
        date: localDate("UTC"),
        slotType: "cards",
        ref: "cards-1",
        estMinutes: SLOT_MINUTES.cards,
        status: "skipped",
        reason: "Skipped for the e2e user",
      })
      .onConflictDoNothing();
  }
}

/** Moves the plan's start two days back. Today's first open then fills the two days between as missed. */
async function backdate(userId: string) {
  await db
    .update(campaigns)
    .set({ startDate: addDays(localDate("UTC"), -2) })
    .where(and(eq(campaigns.userId, userId), eq(campaigns.status, "active")));
}

/** `count` correct answers dated now, all against one live card: enough for the day's totals, and the queue still has the others. */
async function answerCards(userId: string, count: number) {
  const [card] = await db.select({ id: cards.id }).from(cards).where(eq(cards.status, "live")).limit(1);
  if (!card) throw new Error("test sign-in: no live card to answer");
  await db
    .insert(cardReviews)
    .values(Array.from({ length: count }, () => ({ userId, cardId: card.id, score: 1, outcome: "correct", gradedBy: "pure" })));
}
