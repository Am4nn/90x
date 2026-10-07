import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { analytics } from "@/lib/admin/analytics";
import { formatMinutes, isMature, parseRange, RANGES, ratioText } from "@/lib/admin/analytics-math";
import { requireAdmin } from "@/lib/auth/viewer";
import { AdminNav, backToApp } from "../admin-nav";
import { DayBars, Meter, Section, Stat } from "./charts";
import { JobsSection } from "./jobs-section";
import { LaunchGatePanel } from "./launch-gate";

export const metadata: Metadata = { title: "Analytics" };

const usd = (n: number) => `$${n.toFixed(n < 10 ? 2 : 0)}`;
const SOURCE_NAMES = {
  linkedin: "LinkedIn",
  share: "Invite links",
  other: "Other referrers",
  direct: "Direct",
  unknown: "Unknown (before tracking)",
} as const;

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireAdmin();
  const range = parseRange((await searchParams).range);
  const a = await analytics(range);
  const maturePct = (cohortDay: string, n: 1 | 7, hit: number, size: number) =>
    isMature(cohortDay, n, a.today) ? `${hit} of ${size}` : "too soon";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <PageHeader title="Analytics" action={backToApp} />
      <AdminNav current="Analytics" />

      <nav aria-label="Range" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/admin/analytics?range=${r}`}
            aria-current={r === range ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-center text-small font-semibold ${r === range ? "bg-surface-2 text-text" : "text-mute hover:text-text-2"}`}
          >
            {r} days
          </Link>
        ))}
      </nav>
      <p className="text-small text-mute">
        Each person&apos;s own calendar day, test accounts left out. Refreshed at most every 5 minutes (last {a.generatedAt.slice(11, 16)}{" "}
        UTC). Counts first: the groups are small.
      </p>

      <Section title="Growth">
        <Stat title="Signups" value={String(a.growth.total)} detail={`in the last ${range} days`} />
        <div className="rounded-xl border border-line bg-surface p-4">
          <DayBars title="Signups per day" data={a.growth.signups} unit="signups" />
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <h3 className="mb-2 text-small text-text-2">Signups by source</h3>
          <ul className="flex flex-col gap-1.5">
            {a.growth.bySource.map((s) => (
              <li key={s.group} className="flex items-baseline justify-between text-small">
                <span>{SOURCE_NAMES[s.group]}</span>
                <span className="tabular text-text-2">{s.n}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {a.gate && <LaunchGatePanel counts={a.gate} today={a.today} />}

      <Section title="Activation and return" hint="activated = answered a card right or wrong">
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat title="Activated" value={ratioText(a.activation.activated)} detail="of the signups in this range" />
          <Stat
            title="Median time to first answer"
            value={formatMinutes(a.activation.medianMinutes)}
            detail="from signup, activated people only"
          />
          <Stat title="Day-1 return" value={ratioText(a.retention.d1)} detail="active the day after signing up" />
          <Stat title="Day-7 return" value={ratioText(a.retention.d7)} detail="active 7 days after signing up" />
          <Stat
            title="Active people"
            value={`${a.actives.wau} this week`}
            detail={`${a.actives.mau} in 30 days · ${a.actives.dau7} a day on average`}
          />
          <Stat
            title="Stickiness (DAU/WAU)"
            value={a.actives.stickiness === null ? "none yet" : `${a.actives.stickiness}%`}
            detail="average daily actives over this week's actives"
          />
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <DayBars title="Active people per day" data={a.actives.daily} unit="people-days" />
        </div>
        {a.retention.cohorts.length > 0 && (
          <details className="rounded-xl border border-line bg-surface p-4">
            <summary className="cursor-pointer text-small font-semibold">Signup cohorts ({a.retention.cohorts.length})</summary>
            <table className="mt-3 w-full text-small">
              <caption className="sr-only">Return by signup day</caption>
              <thead>
                <tr className="text-left text-mute">
                  <th scope="col" className="py-1 font-normal">
                    Signed up
                  </th>
                  <th scope="col" className="py-1 font-normal">
                    People
                  </th>
                  <th scope="col" className="py-1 font-normal">
                    Day 1
                  </th>
                  <th scope="col" className="py-1 font-normal">
                    Day 7
                  </th>
                </tr>
              </thead>
              <tbody className="tabular">
                {a.retention.cohorts.toReversed().map((c) => (
                  <tr key={c.day} className="border-t border-line">
                    <th scope="row" className="py-1 text-left font-normal">
                      {c.day}
                    </th>
                    <td className="py-1">{c.size}</td>
                    <td className="py-1">{maturePct(c.day, 1, c.d1, c.size)}</td>
                    <td className="py-1">{maturePct(c.day, 7, c.d7, c.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </Section>

      <Section title="Engagement">
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat title="Cards answered" value={String(a.engagement.answered)} detail={`right or wrong · ${a.engagement.skipped} skipped`} />
          <Stat title="Accuracy" value={ratioText(a.engagement.accuracy)} detail="correct of graded, skips left out" />
          <Stat title="Coach messages" value={String(a.engagement.coachTotal)} detail="sent by readers" />
          <Stat title="Missions done" value={ratioText(a.engagement.missions)} detail="of missions on the days shown" />
        </div>
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
          <DayBars title="Cards answered per day" data={a.engagement.answers} unit="cards" />
          <DayBars title="Coach messages per day" data={a.engagement.coach} unit="messages" />
        </div>
      </Section>

      <Section title="Cost" hint="AI spend, UTC days">
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat title="AI spend" value={usd(a.cost.total)} detail={`in the last ${range} days`} />
          <Stat
            title="Per active person"
            value={a.cost.perActive === null ? "none yet" : usd(a.cost.perActive)}
            detail={`${a.cost.activeUsers} active in this range`}
          />
        </div>
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
          <DayBars
            title="AI spend per day"
            data={a.cost.daily.map((d) => ({ day: d.day, n: d.usd }))}
            unit="dollars"
            format={(n) => `$${n.toFixed(2)}`}
          />
          <Meter
            label="Lifetime spend against the ceiling"
            value={a.cost.lifetime}
            max={a.cost.cap}
            text={`${usd(a.cost.lifetime)} of ${usd(a.cost.cap)}`}
          />
        </div>
      </Section>

      <JobsSection />
    </main>
  );
}
