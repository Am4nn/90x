import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { missions, problems, profiles } from "@/db/schema";
import { activeCampaign } from "@/lib/tracker/campaign";
import { addDays, localDate } from "@/lib/tracker/dates";
import { refreshDay } from "@/lib/tracker/service";
import { SLOT_MINUTES } from "@/lib/tracker/template";
import { ladderDays } from "./lesson-rules";

// Coach puts problems on the plan (the review's "Queue next problem", the
// lesson's queue_ladder confirm): extra new-problem missions, first today and
// the rest tomorrow. Scoped to the userId the caller passes (the viewer).

const MAX_QUEUED = 3;

export type QueueResult = { added: number; today: number } | { error: string };

export async function queueProblems(userId: string, slugs: string[], reason: string): Promise<QueueResult> {
  const wanted = [...new Set(slugs)].slice(0, MAX_QUEUED);
  if (!wanted.length) return { error: "Nothing to queue." };
  const [campaign, [profile], known] = await Promise.all([
    activeCampaign(userId),
    db.select({ timezone: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId)),
    db
      .select({ slug: problems.slug })
      .from(problems)
      .where(and(inArray(problems.slug, wanted), eq(problems.kind, "leetcode"))),
  ]);
  const today = localDate(profile?.timezone ?? "UTC");
  const lastDay = campaign ? addDays(campaign.startDate, campaign.lengthDays - 1) : null;
  if (!campaign || !lastDay || today < campaign.startDate || today > lastDay) {
    return { error: "You don't have an active plan, so this can't go on Today. Open the problem instead." };
  }
  const real = new Set(known.map((k) => k.slug));
  const plan = ladderDays(
    wanted.filter((s) => real.has(s)),
    today,
    lastDay,
  );
  if (!plan.length) return { error: "Those problems aren't in the library." };

  const inserted = await db
    .insert(missions)
    .values(plan.map((p) => ({ userId, date: p.date, slotType: "new_problem", ref: p.slug, estMinutes: SLOT_MINUTES.new_problem, reason })))
    .onConflictDoNothing()
    .returning({ date: missions.date });
  const onToday = inserted.filter((m) => m.date === today).length;
  if (onToday) await refreshDay(userId, today, db);
  return { added: inserted.length, today: onToday };
}
