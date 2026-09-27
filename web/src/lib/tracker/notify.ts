import { localDate, localHour, weekday } from "./dates";

// What the hourly job owes each user this hour, by their local clock:
// midnight rolls the day over, the chosen hour sends the plan, 8 pm reminds,
// Sunday 6 pm writes the weekly review.

const EVENING_HOUR = 20;
const WEEKLY_HOUR = 18;
const SUNDAY = 0;

// Every user gets a weekly review; notifications.weekly only mutes its push (lib/coach/weekly.ts).
export type JobUser = { userId: string; timezone: string; morningHour: number | null; evening: boolean };
export type Job = { userId: string; kind: "rollover" | "morning" | "evening" | "weekly" };

export function dueJobs(users: JobUser[], now: Date): Job[] {
  const jobs: Job[] = [];
  for (const u of users) {
    const hour = localHour(u.timezone, now);
    if (hour === 0) jobs.push({ userId: u.userId, kind: "rollover" });
    if (u.morningHour != null && hour === u.morningHour) jobs.push({ userId: u.userId, kind: "morning" });
    if (u.evening && hour === EVENING_HOUR) jobs.push({ userId: u.userId, kind: "evening" });
    if (hour === WEEKLY_HOUR && weekday(localDate(u.timezone, now)) === SUNDAY) jobs.push({ userId: u.userId, kind: "weekly" });
  }
  return jobs;
}

function duration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

export function morningText(missions: number, minutes: number) {
  return {
    title: `Today: ${missions} ${missions === 1 ? "mission" : "missions"}`,
    body: `About ${duration(minutes)}. Start with the first one.`,
  };
}

export function eveningText(left: number, streak: number) {
  const title = `${left} ${left === 1 ? "mission" : "missions"} left today`;
  const it = left === 1 ? "it" : "them";
  return { title, body: streak > 0 ? `Finish ${it} to keep your ${streak}-day streak.` : `Finish ${it} to cross today off.` };
}
