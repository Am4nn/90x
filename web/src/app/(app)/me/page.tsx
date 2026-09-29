import type { Metadata } from "next";
import Link from "next/link";
import { button } from "@/components/button-styles";
import { EmptyState } from "@/components/empty-state";
import { FriendsIcon } from "@/components/icons";
import { LeetCodeCard } from "@/components/leetcode/leetcode-card";
import { PageHeader } from "@/components/page-header";
import { AreaBars, Dial, Trend } from "@/components/tracker/scoreboard";
import { leetcodeStatus, syncedWithoutTime } from "@/lib/activity/queries";
import { syncEnabled } from "@/lib/activity/service";
import { requireViewer } from "@/lib/auth/viewer";
import { myDashboard, type WeekSummary } from "@/lib/tracker/me";

export const metadata: Metadata = { title: "Me" };

function WeekCell({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="bg-surface p-4">
      <div className="text-small text-mute">{label}</div>
      <div className="tabular font-display text-title font-bold text-text">
        {value}
        {unit && <span className="ml-1 font-sans text-small font-medium text-mute">{unit}</span>}
      </div>
    </div>
  );
}

function WeekRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3.5 first:border-0">
      <span className="text-text-2">{label}</span>
      <span className="tabular font-display text-heading font-bold text-text">{value}</span>
    </div>
  );
}

/** Personal "This week": solved, streak, reviews due and last mock — a 2×2 card
 *  on phone, a labelled list on desktop. */
function ThisWeek({ week }: { week: WeekSummary }) {
  const lastMock = week.lastMock == null ? "—" : String(week.lastMock);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-heading font-semibold">This week</h2>
        <span className="text-small text-mute">{week.range}</span>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:hidden">
        <WeekCell label="Solved" value={String(week.solved)} />
        <WeekCell label="Streak" value={String(week.streak)} unit="days" />
        <WeekCell label="Reviews due" value={String(week.reviewsDue)} />
        <WeekCell label="Last mock" value={lastMock} />
      </div>
      <div className="hidden overflow-hidden rounded-xl border border-line bg-surface md:block">
        <WeekRow label="Solved" value={String(week.solved)} />
        <WeekRow label="Streak" value={`${week.streak} days`} />
        <WeekRow label="Reviews due" value={String(week.reviewsDue)} />
        <WeekRow label="Last mock" value={lastMock} />
      </div>
    </div>
  );
}

export default async function MePage() {
  const viewer = await requireViewer();
  const enabled = syncEnabled();
  const [status, pendingTime] = enabled ? await Promise.all([leetcodeStatus(viewer.id), syncedWithoutTime(viewer.id)]) : [null, []];
  const mine = await myDashboard(viewer.id, viewer.timezone);

  return (
    <>
      <PageHeader
        title="Me"
        action={[
          viewer.isAdmin && (
            <Link key="admin" href="/admin" className={`${button({ size: "sm" })} md:hidden`}>
              Admin
            </Link>
          ),
          <Link key="plan" href="/me/plan" className={button({ size: "sm" })}>
            Plan
          </Link>,
          <Link key="settings" href="/me/settings" className={button({ size: "sm" })}>
            Settings
          </Link>,
        ]}
      />

      {/* Friends has no mobile tab, so it is reached from Me. */}
      <Link
        href="/friends"
        className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 md:hidden"
      >
        <span className="flex items-center gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-cyan-bg text-cyan">
            <FriendsIcon className="size-4" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold text-text">Friends</span>
            <span className="text-small text-mute">Compare progress and activity</span>
          </span>
        </span>
        <span aria-hidden className="text-mute">
          →
        </span>
      </Link>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
        <section className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center gap-5">
            <Dial value={mine.overall} />
            <div className="flex flex-col gap-2">
              <Trend points={mine.trend} />
              {mine.overall == null && <span className="text-small text-mute">Check in a few problems to get a score.</span>}
            </div>
          </div>
          <AreaBars areas={mine.areas} />
        </section>

        <ThisWeek week={mine.week} />

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-heading font-semibold">Weakest patterns</h2>
          {mine.weakest.length ? (
            <ul className="flex flex-col rounded-xl border border-line bg-surface">
              {mine.weakest.map((p) => (
                <li key={p.slug} className="flex items-center justify-between gap-3 border-t border-line px-4 py-3.5 first:border-0">
                  <Link href={`/library?pattern=${p.slug}`} className="font-semibold text-text hover:text-cyan md:hidden">
                    {p.name}
                  </Link>
                  <span className="hidden font-semibold text-text md:inline">{p.name}</span>
                  <span className="text-small text-mute">
                    {p.detail}
                    <Link href={`/library?pattern=${p.slug}`} className="ml-1.5 hidden font-semibold text-cyan md:inline">
                      · Practise
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing to flag yet">Patterns you struggle with show up here after a few check-ins.</EmptyState>
          )}
        </section>

        {enabled && <LeetCodeCard status={status} pendingTime={pendingTime} />}
      </div>
    </>
  );
}
