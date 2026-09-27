import "server-only";
import { generateText, Output } from "ai";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { cardReviews, checkins, days, mocks, problems, profiles, weeklyReviews } from "@/db/schema";
import { NO_THINKING } from "@/lib/ai";
import { patternMap } from "@/lib/library/queries";
import { sendToUser, settingsOf } from "@/lib/push";
import { activeCampaign, setTemplates } from "@/lib/tracker/campaign";
import { localDate } from "@/lib/tracker/dates";
import { weakestPatterns } from "@/lib/tracker/me-rules";
import { snapshotReadiness } from "@/lib/tracker/service";
import { parseTemplates } from "@/lib/tracker/template";
import { ageMemory, memoryForPrompt } from "./memory";
import { coachModel, trackCoachUsage } from "./model";
import { applyChanges, type Change, validChanges, WeeklySchema, weekStartOf } from "./weekly-rules";

// The Sunday weekly review: the formula score next to the coach's
// own read, a short summary, and template changes that wait for Accept.
// Everything here reads and writes one user's rows.

const WEEKLY_SYSTEM = `You are Coach, writing one person's weekly review of their interview preparation.
Be direct and specific: name problems, patterns, areas and numbers from the data. No filler, no praise without evidence, no exclamation marks.
- coachScore: your own 0-100 estimate of how ready they are for interviews now, using the same bands as the formula (under 40 not ready, 40-69 getting there, 70+ ready). It may differ from the formula score; say why in the summary if it does.
- summary: markdown, at most 180 words, second person ("You..."). What went well, what slipped, and the one thing to focus on next week.
- suggestedChanges: 0-3 edits to their daily template, only if the week's data supports them. weekday is 0 (Sunday) to 6 (Saturday); slot is new_problem, review, topic or cards; from must equal the current count in the template below; to is the new count (0-6). Every day must keep at least one new_problem, review or topic slot. why is one short sentence.`;

type Week = { userId: string; today: string; weekStart: string };

async function weekData({ userId, today, weekStart }: Week) {
  const since = `${weekStart}T00:00:00Z`;
  const [readiness, checkinRows, [cards], mockRows, dayRows, map, memory, campaign] = await Promise.all([
    snapshotReadiness(userId, today),
    db
      .select({ title: problems.title, result: checkins.result, minutes: checkins.minutes })
      .from(checkins)
      .innerJoin(problems, eq(problems.slug, checkins.problemSlug))
      .where(and(eq(checkins.userId, userId), gte(checkins.createdAt, since)))
      .orderBy(desc(checkins.createdAt))
      .limit(40),
    db
      .select({
        answered: sql<number>`count(*)::int`,
        correct: sql<number>`count(*) filter (where ${cardReviews.outcome} = 'correct')::int`,
      })
      .from(cardReviews)
      .where(and(eq(cardReviews.userId, userId), eq(cardReviews.diagnostic, false), gte(cardReviews.createdAt, since))),
    db
      .select({ type: mocks.type, topic: mocks.topic, score: mocks.score })
      .from(mocks)
      .where(and(eq(mocks.userId, userId), eq(mocks.status, "done"), gte(mocks.startedAt, since))),
    db
      .select({ date: days.date, status: days.status })
      .from(days)
      .where(and(eq(days.userId, userId), gte(days.date, weekStart), lte(days.date, today))),
    patternMap(userId),
    memoryForPrompt(userId),
    activeCampaign(userId),
  ]);
  const count = (status: string) => dayRows.filter((d) => d.status === status).length;
  const templates = campaign ? parseTemplates(campaign.templates) : null;
  return {
    formulaScore: readiness.overall,
    templates: templates?.success ? templates.data : null,
    memory,
    facts: {
      week: `${weekStart} to ${today}`,
      readiness: { overall: readiness.overall, areas: readiness.perArea },
      checkins: {
        solved: checkinRows.filter((c) => c.result === "solved").length,
        withHints: checkinRows.filter((c) => c.result === "hints").length,
        failed: checkinRows.filter((c) => c.result === "failed").length,
        recent: checkinRows.slice(0, 15).map((c) => `${c.title}: ${c.result}${c.minutes ? `, ${c.minutes}m` : ""}`),
      },
      cards: { answered: cards?.answered ?? 0, correct: cards?.correct ?? 0 },
      mocks: mockRows.map((m) => `${m.type} "${m.topic}": ${m.score}`),
      days: { done: count("done"), partial: count("partial"), missed: count("missed"), rest: count("rest") },
      weakestPatterns: weakestPatterns(map.patterns, 3).map((p) => `${p.name} (${p.detail})`),
    },
  };
}

/**
 * Writes the week's review once (unique user + week), ages memory, and pushes
 * "ready" if the user wants it. Returns the review id, or null if this week
 * already has one.
 */
export async function generateWeeklyReview(userId: string, now = new Date()): Promise<string | null> {
  const [profile] = await db
    .select({ timezone: profiles.timezone, notifications: profiles.notifications })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  const today = localDate(profile?.timezone ?? "UTC", now);
  const weekStart = weekStartOf(today);
  const [existing] = await db
    .select({ id: weeklyReviews.id })
    .from(weeklyReviews)
    .where(and(eq(weeklyReviews.userId, userId), eq(weeklyReviews.weekStart, weekStart)));
  if (existing) return null;

  const data = await weekData({ userId, today, weekStart });
  const { model } = await coachModel();
  const result = await generateText({
    model,
    system: WEEKLY_SYSTEM,
    prompt: [
      `Formula readiness score: ${data.formulaScore ?? "not enough data"}`,
      `This week:\n${JSON.stringify(data.facts, null, 1)}`,
      `Current daily template (weekday -> slot counts):\n${data.templates ? JSON.stringify(data.templates) : "(no active campaign: suggest no changes)"}`,
      `What you know about them:\n${data.memory}`,
    ].join("\n\n"),
    output: Output.object({ schema: WeeklySchema }),
    temperature: 0.3,
    providerOptions: NO_THINKING,
  });
  await trackCoachUsage(userId, "coach.weekly", model, result);
  const changes = data.templates ? validChanges(data.templates, result.output.suggestedChanges) : [];

  const [row] = await db
    .insert(weeklyReviews)
    .values({
      userId,
      weekStart,
      formulaScore: data.formulaScore,
      coachScore: result.output.coachScore,
      summaryMd: result.output.summary.trim(),
      suggestedChanges: changes,
    })
    .onConflictDoNothing({ target: [weeklyReviews.userId, weeklyReviews.weekStart] })
    .returning({ id: weeklyReviews.id });
  if (!row) return null;

  await ageMemory(userId, now);
  if (settingsOf(profile?.notifications).weekly) {
    await sendToUser(userId, {
      title: "Your weekly review is ready",
      body: `Coach's read: ${result.output.coachScore}. See what to change next week.`,
      url: `/me/weekly/${row.id}`,
      tag: "weekly",
    });
  }
  return row.id;
}

/** The newest review, for the line beside the dial on Me. */
export async function latestWeekly(userId: string) {
  const [row] = await db
    .select({ id: weeklyReviews.id, weekStart: weeklyReviews.weekStart, coachScore: weeklyReviews.coachScore })
    .from(weeklyReviews)
    .where(eq(weeklyReviews.userId, userId))
    .orderBy(desc(weeklyReviews.weekStart))
    .limit(1);
  return row ?? null;
}

export async function weeklyView(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(weeklyReviews)
    .where(and(eq(weeklyReviews.id, id), eq(weeklyReviews.userId, userId)));
  if (!row) return null;
  return { ...row, changes: (Array.isArray(row.suggestedChanges) ? row.suggestedChanges : []) as Change[] };
}

/** Accept applies the review's template changes; decline only records the answer. Returns an error or null. */
export async function decideWeekly(userId: string, id: string, accept: boolean): Promise<string | null> {
  const review = await weeklyView(userId, id);
  if (!review) return "That review isn't yours or doesn't exist.";
  if (review.accepted != null) return "You already answered this one.";
  if (accept && review.changes.length) {
    const campaign = await activeCampaign(userId);
    const current = campaign ? parseTemplates(campaign.templates) : null;
    if (!current?.success) return "Start a campaign first.";
    const next = applyChanges(current.data, review.changes);
    if (!next) return "Your plan changed since this review. Edit it on the Plan page instead.";
    const error = await setTemplates(userId, next);
    if (error) return error;
  }
  await db
    .update(weeklyReviews)
    .set({ accepted: accept })
    .where(and(eq(weeklyReviews.id, id), eq(weeklyReviews.userId, userId)));
  return null;
}
