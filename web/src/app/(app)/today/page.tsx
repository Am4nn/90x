import type { Metadata } from "next";
import Link from "next/link";
import { button } from "@/components/button-styles";
import { Ren } from "@/components/coach/ren";
import { WeeklyRead } from "@/components/coach/weekly-read";
import { EmptyState } from "@/components/empty-state";
import { Markdown } from "@/components/markdown";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { PageHeader } from "@/components/page-header";
import { PendingRequests } from "@/components/tracker/friends-ui";
import { Grid } from "@/components/tracker/grid";
import { MissionList, ReviveBanner } from "@/components/tracker/missions";
import { requireViewer } from "@/lib/auth/viewer";
import { latestWeekly, weeklyView } from "@/lib/coach/weekly";
import { weekLabel } from "@/lib/coach/weekly-rules";
import { pendingFor } from "@/lib/friends/service";
import { band, BAND_TEXT } from "@/lib/tracker/readiness";
import { ensureToday, todayStats } from "@/lib/tracker/service";

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

export default async function TodayPage() {
  const viewer = await requireViewer();
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

  // `latestWeekly` carries only the id, weekStart and coach score, so the body of
  // the review is a second read. Both are scoped to the viewer; weeklyView returns
  // null for an id that is not theirs, so the card is simply omitted.
  const [stats, latest] = await Promise.all([todayStats(viewer.id, view.today), latestWeekly(viewer.id)]);
  const review = latest ? await weeklyView(viewer.id, latest.id) : null;
  const reviewWeek = review ? weekLabel(review.weekStart) : "";
  const open = view.missions.filter((m) => m.status === "open" && !m.isRevive && !m.isExtra);
  const counted = view.missions.filter((m) => m.status !== "coming_soon" && !m.isRevive && !m.isExtra);
  const finished = counted.filter((m) => m.status === "done" || m.status === "skipped").length;
  const coachLine = view.status === "done" ? "Day done. The square is yours." : open[0]?.reason;

  return (
    <>
      <PageHeader title="Today" action={planLink} />
      <p className="-mt-3 text-small text-mute">
        Day {view.dayNumber} · {view.streak}-day streak · {view.daysLeft} {view.daysLeft === 1 ? "day" : "days"} left
      </p>
      {offlineBanner}

      {pending}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)] md:gap-8">
        <div className="flex flex-col gap-6">
          {review && (
            <WeeklyRead
              key={review.weekStart}
              id={review.id}
              weekStart={review.weekStart}
              weekLabel={reviewWeek}
              coachScore={review.coachScore}
              formulaScore={review.formulaScore}
              changes={review.changes}
            >
              <Markdown>{review.summaryMd}</Markdown>
            </WeeklyRead>
          )}
          {coachLine && (
            <div className="flex items-start gap-3">
              <Ren title="Coach" />
              <span className="pt-0.5 text-text-2">{coachLine}</span>
            </div>
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
          </section>
        </div>

        <aside className="hidden flex-col gap-6 md:flex">
          <div className="flex flex-col gap-3">
            <span className="text-small text-mute">{view.campaign.lengthDays} days</span>
            <Grid days={view.grid} today={view.today} />
          </div>
          <div className="grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-surface">
            <Stat
              label="Readiness"
              value={stats.readiness == null ? "—" : String(stats.readiness)}
              tone={stats.readiness == null ? "text-mute" : BAND_TEXT[band(stats.readiness)]}
            />
            <Stat label="Solved" value={String(stats.solved)} />
            <Stat label="Reviews due" value={String(stats.reviewsDue)} />
          </div>
        </aside>
      </div>
    </>
  );
}
