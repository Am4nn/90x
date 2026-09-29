import type { Metadata } from "next";
import Link from "next/link";
import { button } from "@/components/button-styles";
import { EmptyState } from "@/components/empty-state";
import { FriendsIcon } from "@/components/icons";
import { LeetCodeCard } from "@/components/leetcode/leetcode-card";
import { PageHeader } from "@/components/page-header";
import { AreaBars, Dial, Scoreboard, Trend } from "@/components/tracker/scoreboard";
import { leetcodeStatus, syncedWithoutTime } from "@/lib/activity/queries";
import { syncEnabled } from "@/lib/activity/service";
import { requireViewer } from "@/lib/auth/viewer";
import { latestWeekly } from "@/lib/coach/weekly";
import { myDashboard, scoreboard } from "@/lib/tracker/me";

export const metadata: Metadata = { title: "Me" };

const weekOf = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function MePage() {
  const viewer = await requireViewer();
  const enabled = syncEnabled();
  const [status, pendingTime] = enabled ? await Promise.all([leetcodeStatus(viewer.id), syncedWithoutTime(viewer.id)]) : [null, []];
  // The scoreboard waits for the dial's number to be computed and saved, so "You" reads the same one.
  const dashboard = myDashboard(viewer.id, viewer.timezone).then(async (mine) => ({ mine, people: await scoreboard(viewer.id) }));
  const [{ mine, people }, weekly] = await Promise.all([dashboard, latestWeekly(viewer.id)]);

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
          <FriendsIcon className="size-5 text-mute" />
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
              {weekly && (
                <Link href={`/me/weekly/${weekly.id}`} className="text-small font-semibold text-text-2 hover:text-cyan">
                  Coach&apos;s read: <span className="tabular text-text">{weekly.coachScore ?? "—"}</span> · week of{" "}
                  {weekOf(weekly.weekStart)}
                </Link>
              )}
            </div>
          </div>
          <AreaBars areas={mine.areas} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-heading font-semibold">Weakest patterns</h2>
          {mine.weakest.length ? (
            <ul className="flex flex-col rounded-xl border border-line bg-surface">
              {mine.weakest.map((p) => (
                <li key={p.slug} className="flex items-center justify-between gap-3 border-t border-line px-4 py-3.5 first:border-0">
                  <Link href={`/library?pattern=${p.slug}`} className="font-semibold text-text hover:text-cyan">
                    {p.name}
                  </Link>
                  <span className="text-small text-mute">{p.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing to flag yet">Patterns you struggle with show up here after a few check-ins.</EmptyState>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-heading font-semibold">This week</h2>
          <Scoreboard people={people} />
        </section>

        {enabled && (
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-heading font-semibold">LeetCode</h2>
            <LeetCodeCard status={status} pendingTime={pendingTime} />
          </section>
        )}
      </div>
    </>
  );
}
