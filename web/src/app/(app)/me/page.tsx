import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { setMinutes } from "@/app/actions/sync";
import { EmptyState } from "@/components/empty-state";
import { SubmitButton } from "@/components/form";
import { SyncButton } from "@/components/leetcode/sync-button";
import { PageHeader } from "@/components/page-header";
import { PushSettings } from "@/components/push/push-settings";
import { Activity, AreaBars, Dial, Scoreboard, Trend } from "@/components/tracker/scoreboard";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { leetcodeStatus, syncedWithoutTime } from "@/lib/activity/queries";
import { syncEnabled } from "@/lib/activity/service";
import { requireViewer } from "@/lib/auth/viewer";
import { pushEnabled, settingsOf } from "@/lib/push";
import { friendActivity, myDashboard, scoreboard } from "@/lib/tracker/me";

export const metadata: Metadata = { title: "Me" };

const CHIPS = [15, 30, 45, 60];

export default async function MePage() {
  const viewer = await requireViewer();
  const enabled = syncEnabled();
  const [status, pendingTime] = enabled ? await Promise.all([leetcodeStatus(viewer.id), syncedWithoutTime(viewer.id)]) : [null, []];
  const t = status?.totals;
  const [mine, people, activity, [prefs]] = await Promise.all([
    myDashboard(viewer.id, viewer.timezone),
    scoreboard(viewer.id),
    friendActivity(viewer.id),
    db
      .select({ notifications: profiles.notifications, morningHour: profiles.morningPushHour })
      .from(profiles)
      .where(eq(profiles.userId, viewer.id)),
  ]);

  return (
    <>
      <PageHeader
        title="Me"
        action={
          <div className="flex gap-2">
            {viewer.isAdmin && (
              <Link
                href="/admin"
                className="flex h-9 items-center rounded-[10px] border border-line px-3 text-small font-semibold text-text-2 hover:text-text"
              >
                Admin
              </Link>
            )}
            <Link
              href="/me/plan"
              className="flex h-9 items-center rounded-[10px] border border-line px-3 text-small font-semibold text-text-2 hover:text-text"
            >
              Plan
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-2 md:gap-8">
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

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-heading font-semibold">Friends</h2>
          <Activity items={activity} />
        </section>
      </div>

      {enabled && (
        <section className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-heading font-semibold">LeetCode</h2>
              <p className="text-small text-mute">
                {status?.unavailable
                  ? "LeetCode sync unavailable; retrying daily."
                  : status?.lastSuccessAt
                    ? "Synced recently"
                    : "Not synced yet"}
              </p>
            </div>
            <SyncButton />
          </div>

          {t && (
            <div className="grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-surface">
              {(["easy", "medium", "hard"] as const).map((d) => (
                <div key={d} className="flex flex-col gap-1.5 p-4">
                  <span className="text-small text-mute capitalize">{d}</span>
                  <span className="tabular font-display text-display font-bold">{t.accepted[d] ?? 0}</span>
                  <span className="text-small text-mute">{t.failed[d] ?? 0} attempted</span>
                </div>
              ))}
            </div>
          )}

          {pendingTime.length > 0 && (
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
              <span className="font-semibold">How long did these take?</span>
              {pendingTime.map((c) => (
                <div key={c.id} className="flex flex-col gap-2 border-t border-line pt-3 first:border-0 first:pt-0">
                  <span className="text-small text-text-2">
                    {c.title} ·{" "}
                    {c.result === "solved"
                      ? c.attempts && c.attempts > 1
                        ? `solved after ${c.attempts} tries`
                        : "solved first try"
                      : "not solved"}
                  </span>
                  <form action={setMinutes} className="flex gap-2">
                    <input type="hidden" name="checkinId" value={c.id} />
                    {CHIPS.map((m) => {
                      const suggested = c.suggested && Math.abs(c.suggested - m) <= 7;
                      return (
                        <button
                          key={m}
                          name="minutes"
                          value={m}
                          className={`h-9 flex-1 rounded-lg border text-small font-semibold ${suggested ? "border-cyan bg-cyan-bg text-cyan" : "border-line-2 text-text-2"}`}
                        >
                          {m === 60 ? "60m+" : `${m}m`}
                        </button>
                      );
                    })}
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {pushEnabled() && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-heading font-semibold">Notifications</h2>
          <PushSettings
            vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!}
            initial={{ ...settingsOf(prefs?.notifications), morningHour: prefs?.morningHour ?? null }}
          />
        </section>
      )}

      <form action={signOut}>
        <SubmitButton
          pendingLabel="Signing out…"
          className="h-10 rounded-xl border border-line-2 px-4 text-small font-semibold text-text-2 disabled:opacity-60"
        >
          Sign out
        </SubmitButton>
      </form>
    </>
  );
}
