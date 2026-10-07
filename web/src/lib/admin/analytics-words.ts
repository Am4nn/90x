import { addDays } from "@/lib/tracker/dates";
import { type AreaRow, dayMonth, type FunnelStep, MIN_GROUP_FOR_PCT, pct } from "./analytics-math";

// The "In plain words" captions on /admin/analytics, written from the numbers so they change with the
// 7/30/90 switch. Pure, so each sentence is tested against fixed data. Counts come first: groups are small.

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const usd = (n: number) => `$${n.toFixed(2)}`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export type Change = { dir: "up" | "down" | "flat"; text: string };

/** "+3 vs last Wednesday", "−4 vs the 7 days before", "same as ...". The arrow is drawn by the page. */
export function changeWords(now: number, before: number, unit: string): Change {
  const d = now - before;
  if (d === 0) return { dir: "flat", text: `same as ${unit}` };
  return { dir: d > 0 ? "up" : "down", text: `${d > 0 ? "+" : "−"}${Math.abs(d)} vs ${unit}` };
}

/** People active each day: the trend, the peak and the launch post, or "too few" for a handful. */
export function dauCaption(daily: { day: string; n: number }[], launchDate: string | null): string {
  const busy = daily.filter((d) => d.n > 0);
  if (busy.length === 0) return `Nobody was active in these ${daily.length} days.`;
  const peak = busy.reduce((a, b) => (b.n > a.n ? b : a));
  if (peak.n <= 2) return `Too few to call a trend: someone was active on ${plural(busy.length, "day")}, never more than ${peak.n} a day.`;
  const last7 = daily.slice(-7).map((d) => d.n);
  const avg = Math.round((sum(last7) / last7.length) * 10) / 10;
  const launched = launchDate && launchDate >= daily[0]!.day && launchDate <= daily.at(-1)!.day;
  const peakText = `${plural(peak.n, "person", "people")} on ${dayMonth(peak.day)}`;
  return launched && peak.day >= launchDate
    ? `The launch post brought a peak of ${peakText}. The last 7 days averaged ${avg} a day.`
    : `The busiest day had ${peakText}. The last 7 days averaged ${avg} a day.`;
}

/** The newest sign-up week whose second week is over: how many came back. */
export function cohortCaption(cohorts: { week: string; size: number; back: number[] }[], today: string): string {
  const judged = cohorts.filter((c) => c.size > 0 && addDays(c.week, 13) < today);
  const last = judged.at(-1);
  if (!last) return "Nobody has been here long enough to come back a week later.";
  const p = last.size >= MIN_GROUP_FOR_PCT ? ` (${pct(last.back[0]!, last.size)}%)` : "";
  return `${last.back[0]} of ${plural(last.size, "person", "people")} who joined the week of ${dayMonth(last.week)} came back the week after${p}.`;
}

/** Actions per day: what people do most, per active person-day, and what is barely used. */
export function actionsCaption(totals: Record<string, { name: string; n: number }>, personDays: number, range: number): string {
  const all = Object.values(totals);
  if (all.every((k) => k.n === 0)) return `Nothing to count yet in these ${range} days.`;
  const top = all.reduce((a, b) => (b.n > a.n ? b : a));
  const per = personDays > 0 ? Math.round((top.n / personDays) * 10) / 10 : null;
  const lead =
    per === null
      ? `${top.name} lead with ${top.n} in ${range} days.`
      : `${top.name} lead: about ${per} per person on each day they were active.`;
  const least = all.filter((k) => k !== top).reduce((a, b) => (b.n < a.n ? b : a));
  return least.n < 3 ? `${lead} ${least.name} are barely used (${least.n} in ${range} days).` : lead;
}

/** Where people drop off: the biggest leak, or the counts for a handful. */
export function funnelCaption(steps: FunnelStep[], worst: number | null, showPct: boolean, range: number): string {
  const signed = steps[0]!.n ?? 0;
  if (signed === 0) return `Nobody signed up in these ${range} days.`;
  if (!showPct) {
    const stop = steps.slice(1, 4).find((s) => (s.n ?? 0) < signed);
    const where = stop ? ` ${signed - (stop.n ?? 0)} stopped before "${stop.name.toLowerCase()}".` : "";
    return `${plural(signed, "person", "people")} signed up.${where} Percentages show from ${MIN_GROUP_FOR_PCT} people.`;
  }
  if (worst === null) return `Everyone who signed up got as far as a first finished day.`;
  const a = steps[worst - 1]!;
  const b = steps[worst]!;
  return `The biggest leak is between "${a.name.toLowerCase()}" and "${b.name.toLowerCase()}": ${plural((a.n ?? 0) - (b.n ?? 0), "person", "people")} stopped there.`;
}

/** Answers by area: where the answers go, and where people miss most (areas with 10+ answers). */
export function areasCaption(rows: AreaRow[], range: number): string {
  const total = sum(rows.map((r) => r.n));
  if (total === 0) return `No Feed answers in these ${range} days.`;
  const top = rows.reduce((a, b) => (b.n > a.n ? b : a));
  const lead = `${top.label} gets ${pct(top.n, total)}% of all answers.`;
  const judged = rows.filter((r) => r.n >= 10 && r.pct !== null);
  if (judged.length < 2) return lead;
  const low = judged.reduce((a, b) => (b.pct! < a.pct! ? b : a));
  if (low === top)
    return `${top.label} gets ${pct(top.n, total)}% of all answers and is where people miss most (${low.pct}% right): the place to check card quality first.`;
  return `${lead} ${low.label} is where people miss most (${low.pct}% right): the place to check card quality first.`;
}

/** Sign-ups by source: the biggest source and what invite links brought. */
export function sourcesCaption(rows: { name: string; n: number }[], invites: number, range: number): string {
  const total = sum(rows.map((r) => r.n));
  if (total === 0) return `No sign-ups in these ${range} days.`;
  const top = rows.reduce((a, b) => (b.n > a.n ? b : a));
  return `${top.name} brought ${top.n} of ${plural(total, "sign-up")}. Invite links from the share card brought ${invites}.`;
}

export function shareCaption(opened: number, invites: number, range: number): string {
  if (opened === 0 && invites === 0) return `Nobody made a share card or joined through one in these ${range} days.`;
  return `${plural(opened, "person", "people")} made a share card and ${plural(invites, "friend")} joined through an invite link.`;
}

/** AI spend: the range total, what readers cost per active person, and days over the daily cap. */
export function spendCaption(daily: { readers: number; builds: number }[], activeUsers: number, dailyCap: number, range: number): string {
  const readers = sum(daily.map((d) => d.readers));
  const builds = sum(daily.map((d) => d.builds));
  if (readers + builds === 0) return `No AI spend in these ${range} days.`;
  const per = activeUsers > 0 ? ` (about ${usd(readers / activeUsers)} per active person)` : "";
  const over = daily.filter((d) => d.readers + d.builds > dailyCap).length;
  const cap = over === 0 ? `No day crossed the ${usd(dailyCap)} cap.` : `${plural(over, "day")} crossed the ${usd(dailyCap)} cap.`;
  return `${usd(readers + builds)} in ${range} days. Readers cost ${usd(readers)}${per}; system jobs and admins ${usd(builds)}. ${cap}`;
}

export function lifetimeCaption(lifetime: number, cap: number, months: number | null): string {
  const used = `${pct(Math.min(lifetime, cap), cap) ?? 0}% used.`;
  if (lifetime >= cap) return `${used} The ceiling is reached: AI features are paused until it is raised.`;
  if (months === null) return `${used} Nothing was spent in the last 30 days.`;
  return `${used} At the last 30 days' pace the ceiling is about ${plural(Math.max(1, Math.round(months)), "month")} away.`;
}

export function reportsCaption(total: number, open: number, range: number): string {
  const waiting = open === 0 ? "None is waiting." : `${open} ${open === 1 ? "is" : "are"} waiting for you.`;
  if (total === 0) return `No reports in these ${range} days. ${waiting}`;
  return `${plural(total, "report")} in ${range} days. ${waiting}`;
}

/** The People list: how far into their campaigns today's regulars are, and who went quiet. */
export function peopleCaption(people: { dayN: number | null; answers7: number }[]): string {
  if (people.length === 0) return "Nobody has done anything real yet.";
  const early = people.filter((p) => p.dayN !== null && p.dayN <= 21).length;
  const quiet = people.filter((p) => p.answers7 === 0).length;
  return `${early} of these ${people.length} are in their first three weeks; ${quiet} answered no cards in the last 7 days.`;
}

/** The "At a glance" lines at the top: one sentence per question the page answers. */
export function glance(g: {
  wau: number;
  wauPrev: number;
  signups: number;
  range: number;
  gate: { returners: number; target: number; by: string } | null;
  leak: string | null;
  lifetime: number;
  cap: number;
}): string[] {
  const d = g.wau - g.wauPrev;
  const trend = d === 0 ? "the same as the week before" : `${Math.abs(d)} ${d > 0 ? "more" : "fewer"} than the week before`;
  const out = [
    `${plural(g.wau, "person", "people")} used 90x in the last 7 days, ${trend}.`,
    `${plural(g.signups, "person", "people")} signed up in the last ${g.range} days.`,
  ];
  if (g.gate) out.push(`Week-2 returners: ${g.gate.returners} of the ${g.gate.target} the launch gate wants by ${dayMonth(g.gate.by)}.`);
  if (g.leak) out.push(`Biggest leak: ${g.leak}.`);
  out.push(`AI spend is at ${usd(g.lifetime)} of ${usd(g.cap)}.`);
  return out;
}
