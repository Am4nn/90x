import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { button } from "@/components/button-styles";
import { EmptyState } from "@/components/empty-state";
import { FriendsIcon } from "@/components/icons";
import { LeetCodeCard } from "@/components/leetcode/leetcode-card";
import { PageHeader } from "@/components/page-header";
import { SectionSkeleton } from "@/components/skeleton";
import { AreaBars, Dial, Trend } from "@/components/tracker/scoreboard";
import { ShareDay } from "@/components/tracker/share-day";
import { XpWeek } from "@/components/tracker/xp-week";
import { hasLeetcodeUsername, leetcodeStatus, syncedWithoutTime } from "@/lib/activity/queries";
import { syncEnabled } from "@/lib/activity/service";
import { requireViewer } from "@/lib/auth/viewer";
import { latestWeekly } from "@/lib/coach/weekly";
import { weekLabel } from "@/lib/coach/weekly-rules";
import { shareSummary } from "@/lib/share/service";
import { siteUrl } from "@/lib/site-url";
import { localDate } from "@/lib/tracker/dates";
import { myDashboard, type WeekSummary } from "@/lib/tracker/me";
import { xpSummary } from "@/lib/xp/queries";

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

type Mine = ReturnType<typeof myDashboard>;

// The three sections below share one dashboard read, started once by the page.
async function Scoreboard({ mine }: { mine: Mine }) {
  const m = await mine;
  return (
    <section className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center gap-5">
        <Dial value={m.shownOverall} />
        <div className="flex flex-col gap-2">
          <Trend points={m.trend} />
          {m.shownOverall == null && <span className="text-small text-mute">Check in a few problems to get a score.</span>}
        </div>
      </div>
      <AreaBars areas={m.areas} />
    </section>
  );
}

async function ThisWeekSection({ mine }: { mine: Mine }) {
  return <ThisWeek week={(await mine).week} />;
}

async function WeakestPatterns({ mine }: { mine: Mine }) {
  const m = await mine;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-heading font-semibold">Weakest patterns</h2>
      {m.weakest.length ? (
        <ul className="flex flex-col rounded-xl border border-line bg-surface">
          {m.weakest.map((p) => (
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
  );
}

async function XpSection({ xp, today }: { xp: ReturnType<typeof xpSummary>; today: string }) {
  const x = await xp;
  return <XpWeek total={x.total} week={x.week} today={today} />;
}

async function LeetCodeSection({ userId }: { userId: string }) {
  const [status, pendingTime, hasUsername] = await Promise.all([
    leetcodeStatus(userId),
    syncedWithoutTime(userId),
    hasLeetcodeUsername(userId),
  ]);
  return <LeetCodeCard status={status} pendingTime={pendingTime} hasUsername={hasUsername} />;
}

async function ShareSection({ userId }: { userId: string }) {
  const summary = await shareSummary(userId);
  // No active campaign, nothing to show on a card.
  if (!summary) return null;
  return (
    // Sized to its content: stretched to the Readiness card beside it on desktop, it was mostly empty.
    <ShareDay
      key={`${summary.dayNumber}-${summary.done + summary.revived}`}
      dayNumber={summary.dayNumber}
      origin={siteUrl().origin}
      className="md:self-start"
    />
  );
}

async function WeeklyDigestLink({ userId }: { userId: string }) {
  const digest = await latestWeekly(userId);
  if (!digest) return null;
  return (
    <Link
      href={`/me/weekly/${digest.id}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 hover:bg-surface-2"
    >
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold text-text">Coach&apos;s weekly digest</span>
        <span className="text-small text-mute">Week of {weekLabel(digest.weekStart)}</span>
      </span>
      <span aria-hidden className="text-mute">
        →
      </span>
    </Link>
  );
}

export default async function MePage() {
  const viewer = await requireViewer();
  const enabled = syncEnabled();
  // Started here, awaited inside each section, so the page frame goes out at once.
  const mine = myDashboard(viewer.id, viewer.timezone);
  const today = localDate(viewer.timezone);
  const xp = xpSummary(viewer.id, today);

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
        <Suspense fallback={<SectionSkeleton heading={false} h={132} />}>
          <ShareSection userId={viewer.id} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton heading={false} h={176} />}>
          <Scoreboard mine={mine} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton h={168} />}>
          <ThisWeekSection mine={mine} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton h={96} />}>
          <XpSection xp={xp} today={today} />
        </Suspense>

        <Suspense fallback={<SectionSkeleton h={140} />}>
          <WeakestPatterns mine={mine} />
        </Suspense>

        {enabled && (
          <Suspense fallback={<SectionSkeleton h={110} />}>
            <LeetCodeSection userId={viewer.id} />
          </Suspense>
        )}
      </div>

      {/* The Coach's read on Today can be dismissed, so it is also kept here. */}
      <Suspense fallback={null}>
        <WeeklyDigestLink userId={viewer.id} />
      </Suspense>
    </>
  );
}
