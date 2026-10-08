import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { profiles, userApprovals } from "@/db/schema";
import { generateWeeklyReview } from "@/lib/coach/weekly";
import { hideStaleCards } from "@/lib/feed/flag-service";
import { type HourlyResult, judgeHourly, judgeWeekly, type SweepResult, tally, type WeeklyResult } from "@/lib/jobs/outcomes";
import { pruneJobRuns, recordJob } from "@/lib/jobs/store";
import { logError } from "@/lib/log";
import { pushEnabled, sendToUser, settingsOf } from "@/lib/push";
import { addDays, localDate } from "@/lib/tracker/dates";
import { dueJobs, eveningText, morningText } from "@/lib/tracker/notify";
import { ensureToday, snapshotReadiness } from "@/lib/tracker/service";
import { qstashJob } from "@/lib/upstash/qstash";

const PATH = "/api/jobs/hourly";

// Sunday 6 pm writes a weekly review per user with one model call each.
export const maxDuration = 300;

/**
 * QStash schedule 90x-hourly (minute 5 of every hour). For each user whose
 * local clock hits the hour: midnight closes yesterday and plans today,
 * the chosen morning hour sends the plan, 8 pm reminds if missions are left,
 * Sunday 6 pm writes the weekly review.
 *
 * Returns counts (readers, due, ok and failed by kind), which qstashJob keeps
 * in job_runs. The weekly reviews and the daily stale-card sweep record their
 * own runs as well.
 */
export const POST = qstashJob(
  PATH,
  async () => {
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
    const result: HourlyResult = { users: users.length, due: jobs.length, ok: {}, failed: {} };
    for (const job of jobs) {
      if (job.kind === "weekly") continue;
      try {
        const view = await ensureToday(job.userId, now);
        if (job.kind === "rollover") {
          await snapshotReadiness(job.userId, addDays(localDate(tz.get(job.userId) ?? "UTC", now), -1));
        } else if (view.state === "active" && pushEnabled()) {
          const counted = view.missions.filter((m) => m.status !== "coming_soon" && !m.isRevive && !m.isExtra);
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
        tally(result.ok, job.kind);
      } catch (e) {
        logError("hourly job failed", e, { kind: job.kind, userId: job.userId });
        tally(result.failed, job.kind);
      }
    }

    // Weekly reviews go after the pushes, so a slow model call never delays a morning plan.
    const weekly = jobs.filter((j) => j.kind === "weekly").map((j) => j.userId);
    if (weekly.length) {
      const w = await recordJob("weekly-reviews", () => writeWeeklyReviews(weekly, now), judgeWeekly);
      if (w.written + w.already_done) result.ok.weekly = w.written + w.already_done;
      if (w.failed) result.failed.weekly = w.failed;
    }

    // Once a day: cards everyone skipped for 14 days leave the feed.
    if (now.getUTCHours() === 0) {
      try {
        await recordJob("stale-sweep", async (): Promise<SweepResult> => ({ hidden: await hideStaleCards(now) }));
        result.sweep = "ok";
      } catch (e) {
        logError("stale card sweep failed", e);
        result.sweep = "failed";
      }
    }

    // job_runs keeps 90 days. A failed delete is tried again next hour and never fails the tick.
    await pruneJobRuns(now).catch((e) => logError("job_runs prune failed", e));

    // One line per run, so a log search shows the schedule is alive and what it found due.
    console.log(JSON.stringify({ evt: "push.hourly", users: users.length, due: jobs.length, pushConfigured: pushEnabled() }));
    return result;
  },
  judgeHourly,
);

/** One weekly review per reader whose Sunday 6 pm is this hour. A failure is counted, not thrown. */
async function writeWeeklyReviews(userIds: string[], now: Date): Promise<WeeklyResult> {
  const result: WeeklyResult = { written: 0, already_done: 0, failed: 0 };
  for (const userId of userIds) {
    try {
      if (await generateWeeklyReview(userId, now)) result.written++;
      else result.already_done++;
    } catch (e) {
      logError("weekly review failed", e, { userId });
      result.failed++;
    }
  }
  return result;
}
