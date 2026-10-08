import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, profiles } from "@/db/schema";
import type { Templates } from "./template";

/** What the first-run welcome needs, or null once it has been seen (or with no active campaign to describe). */
export async function welcomeFor(userId: string) {
  const [row] = await db
    .select({
      seenAt: profiles.welcomeSeenAt,
      weekdayMinutes: profiles.weekdayMinutes,
      weekendMinutes: profiles.weekendMinutes,
      templates: campaigns.templates,
    })
    .from(profiles)
    .leftJoin(campaigns, and(eq(campaigns.userId, profiles.userId), eq(campaigns.status, "active")))
    .where(eq(profiles.userId, userId));
  if (!row || row.seenAt || !row.templates) return null;
  return { templates: row.templates as Templates, weekdayMinutes: row.weekdayMinutes, weekendMinutes: row.weekendMinutes };
}

/** Finished or skipped: either way it is not shown again. The first time is kept. */
export async function markWelcomeSeen(userId: string) {
  await db
    .update(profiles)
    .set({ welcomeSeenAt: sql`coalesce(${profiles.welcomeSeenAt}, now())` })
    .where(eq(profiles.userId, userId));
}
