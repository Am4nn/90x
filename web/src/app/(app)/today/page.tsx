import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { button } from "@/components/button-styles";
import { Ren } from "@/components/coach/ren";
import { WeeklyRead } from "@/components/coach/weekly-read";
import { EmptyState } from "@/components/empty-state";
import { InstallPrompt } from "@/components/install/install-prompt";
import { Markdown } from "@/components/markdown";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { PageHeader } from "@/components/page-header";
import { TilesSkeleton } from "@/components/skeleton";
import { PendingRequests } from "@/components/tracker/friends-ui";
import { Grid } from "@/components/tracker/grid";
import { MissionList, ReviveBanner, WantMore } from "@/components/tracker/missions";
import { ShareDay } from "@/components/tracker/share-day";
import { requireViewer } from "@/lib/auth/viewer";
import { latestWeekly, weeklyView } from "@/lib/coach/weekly";
import { weekLabel } from "@/lib/coach/weekly-rules";
import { pendingFor } from "@/lib/friends/service";
import { siteUrl } from "@/lib/site-url";
import { band, BAND_TEXT } from "@/lib/tracker/readiness";
import { ensureToday, todayStats } from "@/lib/tracker/service";
import { xpOnDay } from "@/lib/xp/queries";

export const metadata: Metadata = { title: "Today" };

const planLink = (
  <Link href="/me/plan" aria-label="Edit plan" className={button({ size: "icon-sm" })}>
    <svg viewBox="0 0 20 20" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 6h8M4 10h12M4 14h6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="13" cy="14" r="1.6" />
    </svg>
  </Link>
);

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-1 p-4">
      <span className="text-small text-mute">{label}</span>
      <span className={`tabular font-display text-title font-bold ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

// The XP line and the stat tiles fill in on their own, behind the page: neither moves
// anything when it lands. The invites and the weekly review sit above the missions, so
// they are read alongside the plan and rendered in place, never pushing the list down.
async function XpToday({ xp }: { xp: ReturnType<typeof xpOnDay> }) {
  const xpToday = await xp;
  // Nothing earned yet says nothing: "0 XP today" on a fresh day is noise.
  if (xpToday <= 0) return null;
  return (
    <>
      {" · "}
      <span className="tabular" data-testid="xp-today">
        {xpToday} XP today
      </span>
    </>
  );
}

type Review = NonNullable<Awaited<ReturnType<typeof weeklyView>>>;

function WeeklyReview({ review }: { review: Review }) {
  return (
    <WeeklyRead
      key={review.weekStart}
      id={review.id}
      weekStart={review.weekStart}
      weekLabel={weekLabel(review.weekStart)}
      coachScore={review.coachScore}
      formulaScore={review.formulaScore}
      changes={review.changes}
    >
      <Markdown>{review.summaryMd}</Markdown>
    </WeeklyRead>
  );
}

async function StatTiles({ stats }: { stats: ReturnType<typeof todayStats> }) {
  const s = await stats;
  return (
    <div className="grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-surface">
      <Stat
        label="Readiness"
        value={s.readiness == null ? "—" : String(s.readiness)}
        tone={s.readiness == null ? "text-mute" : BAND_TEXT[band(s.readiness)]}
      />
      <Stat label="Solved" value={String(s.solved)} />
      <Stat label="Reviews due" value={String(s.reviewsDue)} />
    </div>
  );
}

export default async function TodayPage() {
  const viewer = await requireViewer();
  // Neither the invites nor the weekly review depends on the plan, so both are read alongside
  // ensureToday. `latestWeekly` carries only the id, weekStart and coach score, so the body is a
  // second read; weeklyView returns null for an id that is not the viewer's, so the card is simply
  // omitted. Pages with no campaign never show it: the catch keeps that unawaited read quiet.
  const reviewRead = latestWeekly(viewer.id).then((row) => (row ? weeklyView(viewer.id, row.id) : null));
  reviewRead.catch(() => undefined);
  const [view, pendingReqs] = await Promise.all([ensureToday(viewer.id), pendingFor(viewer.email ?? "")]);
  // One card per pending invite, in every state — a user with no campaign, or a
  // finished one, still receives requests here.
  const pending = <PendingRequests requests={pendingReqs.map((r) => ({ id: r.id, name: r.inviterName }))} />;
  // Stamped into the page, so an offline copy served by the service worker can say how old it is.
  const offlineBanner = <OfflineBanner renderedAt={new Date().toISOString()} />;

  if (view.state === "no_campaign") {
    return (
      <>
        <PageHeader title="Today" />
        {offlineBanner}
        {pending}
        <EmptyState
          title="No campaign yet"
          action={
            <Link href="/me/plan" className={`${button({ variant: "primary" })} mt-1`}>
              Start your campaign
            </Link>
          }
        >
          Pick a length and how much time you have each day, and 90x plans your missions.
        </EmptyState>
      </>
    );
  }

  if (view.state === "ended") {
    const done = view.grid.filter((d) => d.status === "done" || d.status === "revived").length;
    return (
      <>
        <PageHeader title="Today" action={planLink} />
        {offlineBanner}
        {pending}
        <EmptyState
          title={`Campaign complete: ${done} of ${view.grid.length} days done`}
          action={
            <Link href="/me/plan" className={`${button({ variant: "primary" })} mt-1`}>
              Start a new campaign
            </Link>
          }
        >
          Your readiness and history stay on Me.
        </EmptyState>
        <Grid days={view.grid} />
      </>
    );
  }

  // Started together once the plan is written; the XP line and tiles are awaited inside their own sections.
  const stats = todayStats(viewer.id, view.today);
  const xpToday = xpOnDay(viewer.id, view.today);
  const review = await reviewRead;
  const open = view.missions.filter((m) => m.status === "open" && !m.isRevive && !m.isExtra);
  const counted = view.missions.filter((m) => m.status !== "coming_soon" && !m.isRevive && !m.isExtra);
  const finished = counted.filter((m) => m.status === "done" || m.status === "skipped").length;
  const coachLine = view.status === "done" ? "Day done. The square is yours." : open[0]?.reason;
  const finishedDays = view.grid.filter((d) => d.status === "done" || d.status === "revived").length;

  return (
    <>
      <PageHeader title="Today" action={planLink} />
      <p className="-mt-3 text-small text-mute">
        Day {view.dayNumber} · {view.streak}-day streak · {view.daysLeft} {view.daysLeft === 1 ? "day" : "days"} left
        <Suspense fallback={null}>
          <XpToday xp={xpToday} />
        </Suspense>
      </p>
      {offlineBanner}

      {pending}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)] md:gap-8">
        <div className="flex flex-col gap-6">
          {review && <WeeklyReview review={review} />}
          {coachLine && (
            <div className="flex items-start gap-3">
              <Ren title="Coach" />
              <span className="pt-0.5 text-text-2">{coachLine}</span>
            </div>
          )}
          {view.status === "done" && (
            // Keyed on progress: reviving a day while the row is on screen remounts it, so it fetches the
            // card's new version instead of keeping one the share route now 404s.
            <ShareDay key={`${view.dayNumber}-${finishedDays}`} dayNumber={view.dayNumber} origin={siteUrl().origin} />
          )}
          <div className="md:hidden">
            <Grid days={view.grid} today={view.today} />
          </div>
          <ReviveBanner dates={view.revivable} />
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-heading font-semibold">Missions</h2>
              <span className="text-small text-mute">
                {finished} of {counted.length} done
              </span>
            </div>
            {view.missions.length ? (
              <MissionList missions={view.missions} />
            ) : (
              <EmptyState title="Nothing planned today">
                The Library has nothing left to suggest for your template. Edit your plan, or pick anything from the Library: every check-in
                counts.
              </EmptyState>
            )}
            {view.status === "done" && <WantMore />}
          </section>
          {/* Below the missions, so it appearing after hydration never moves them. */}
          <InstallPrompt variant="banner" />
        </div>

        <aside className="hidden flex-col gap-6 md:flex">
          <div className="flex flex-col gap-3">
            <span className="text-small text-mute">{view.campaign.lengthDays} days</span>
            <Grid days={view.grid} today={view.today} />
          </div>
          <Suspense fallback={<TilesSkeleton n={3} />}>
            <StatTiles stats={stats} />
          </Suspense>
        </aside>
      </div>
    </>
  );
}
