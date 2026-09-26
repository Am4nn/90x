import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { profiles, userApprovals } from "@/db/schema";
import { hideStaleCards } from "@/lib/feed/flag-service";
import { pushEnabled, sendToUser, settingsOf } from "@/lib/push";
import { addDays, localDate } from "@/lib/tracker/dates";
import { dueJobs, eveningText, morningText } from "@/lib/tracker/notify";
import { ensureToday, snapshotReadiness } from "@/lib/tracker/service";
import { verifyQStash } from "@/lib/upstash/qstash";

const PATH = "/api/jobs/hourly";

/**
 * QStash schedule 90x-hourly (minute 5 of every hour). For each user whose
 * local clock hits the hour: midnight closes yesterday and plans today,
 * the chosen morning hour sends the plan, 8 pm reminds if missions are left.
 */
export async function POST(request: Request) {
  const body = await request.text();
  if (!(await verifyQStash(request, body, PATH))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const now = new Date();
  const users = await db
    .select({
      userId: profiles.userId,
      timezone: profiles.timezone,
      morningHour: profiles.morningPushHour,
      notifications: profiles.notifications,
    })
    .from(profiles)
    .innerJoin(userApprovals, and(eq(userApprovals.userId, profiles.userId), eq(userApprovals.status, "approved")))
    .where(sql`${profiles.setupDoneAt} is not null`);

  const jobs = dueJobs(
    users.map((u) => ({
      userId: u.userId,
      timezone: u.timezone,
      morningHour: u.morningHour,
      evening: settingsOf(u.notifications).evening,
    })),
    now,
  );
  const tz = new Map(users.map((u) => [u.userId, u.timezone]));
  const results: string[] = [];
  for (const job of jobs) {
    try {
      const view = await ensureToday(job.userId, now);
      if (job.kind === "rollover") {
        await snapshotReadiness(job.userId, addDays(localDate(tz.get(job.userId) ?? "UTC", now), -1));
      } else if (view.state === "active" && pushEnabled()) {
        const counted = view.missions.filter((m) => m.status !== "coming_soon" && !m.isRevive);
        const open = counted.filter((m) => m.status === "open");
        if (job.kind === "morning" && open.length) {
          await sendToUser(job.userId, {
            ...morningText(
              open.length,
              open.reduce((s, m) => s + m.estMinutes, 0),
            ),
            url: "/today",
            tag: "morning",
          });
        }
        if (job.kind === "evening" && open.length) {
          await sendToUser(job.userId, { ...eveningText(open.length, view.streak), url: "/today", tag: "evening" });
        }
      }
      results.push(`${job.kind}: ok`);
    } catch (e) {
      console.error("hourly job failed", job, e);
      results.push(`${job.kind}: failed`);
    }
  }
  // Once a day: cards everyone skipped for 14 days leave the feed.
  if (now.getUTCHours() === 0) {
    try {
      results.push(`stale cards hidden: ${await hideStaleCards(now)}`);
    } catch (e) {
      console.error("stale card sweep failed", e);
      results.push("stale cards: failed");
    }
  }
  return NextResponse.json({ users: users.length, jobs: results });
}
