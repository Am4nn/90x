import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, profiles } from "@/db/schema";
import type { Templates } from "./template";

export type WelcomeData = { templates: Templates; weekdayMinutes: number | null; weekendMinutes: number | null };

/** The welcome (null once seen, or with no active campaign) and the demo steps seen, in one read. */
export async function firstVisitFor(userId: string): Promise<{ welcome: WelcomeData | null; tipsSeen: string[] }> {
  const [row] = await db
    .select({
      seenAt: profiles.welcomeSeenAt,
      tipsSeen: profiles.tipsSeen,
      weekdayMinutes: profiles.weekdayMinutes,
      weekendMinutes: profiles.weekendMinutes,
      templates: campaigns.templates,
    })
    .from(profiles)
    .leftJoin(campaigns, and(eq(campaigns.userId, profiles.userId), eq(campaigns.status, "active")))
    .where(eq(profiles.userId, userId));
  if (!row) return { welcome: null, tipsSeen: [] };
  const welcome =
    row.seenAt || !row.templates
      ? null
      : { templates: row.templates as Templates, weekdayMinutes: row.weekdayMinutes, weekendMinutes: row.weekendMinutes };
  return { welcome, tipsSeen: row.tipsSeen ?? [] };
}

/** Finished or skipped: either way it is not shown again. The first time is kept. */
export async function markWelcomeSeen(userId: string) {
  await db
    .update(profiles)
    .set({ welcomeSeenAt: sql`coalesce(${profiles.welcomeSeenAt}, now())` })
    .where(eq(profiles.userId, userId));
}

/** Adds demo step ids to the seen set; ids already there stay once. */
export async function markTipsSeen(userId: string, ids: readonly string[]) {
  if (!ids.length) return;
  await db
    .update(profiles)
    // A JS array in a sql template becomes a parameter list, not an array: build array[...] from the ids.
    .set({
      tipsSeen: sql`array(select distinct unnest(${profiles.tipsSeen} || array[${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}]::text[]))`,
    })
    .where(eq(profiles.userId, userId));
}
