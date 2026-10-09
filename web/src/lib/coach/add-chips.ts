import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { checkins, problems } from "@/db/schema";
import { localHour } from "@/lib/tracker/dates";
import { timezoneOf, type TodayView } from "@/lib/tracker/service";
import { weakestPatterns } from "./add";
import type { chipsFor } from "./add-rules";

const WEEK_MS = 7 * 86_400_000;

/**
 * What the suggestion chips under the "Tell Coach what to add" field are built from:
 * the last problem solved this week, the weakest pattern, the company focus, the minutes still
 * planned today, and the hour. Owner-only: every read is scoped to userId.
 */
export async function chipInputs(
  userId: string,
  view: Extract<TodayView, { state: "active" }>,
  now = new Date(),
): Promise<Parameters<typeof chipsFor>[0]> {
  const [last, weak, tz] = await Promise.all([
    db
      .select({ title: problems.title })
      .from(checkins)
      .innerJoin(problems, eq(problems.slug, checkins.problemSlug))
      .where(
        and(
          eq(checkins.userId, userId),
          eq(checkins.result, "solved"),
          gte(checkins.createdAt, new Date(now.getTime() - WEEK_MS).toISOString()),
        ),
      )
      .orderBy(desc(checkins.createdAt))
      .limit(1),
    weakestPatterns(userId),
    timezoneOf(userId),
  ]);
  return {
    lastSolved: last[0] ?? null,
    weakestPattern: weak[0] ?? null,
    companies: view.campaign.companyFocus?.companies ?? [],
    plannedMinutesLeft: view.missions
      .filter((m) => m.status === "open" && !m.isExtra && !m.isRevive)
      .reduce((sum, m) => sum + m.estMinutes, 0),
    localHour: localHour(tz, now),
  };
}
