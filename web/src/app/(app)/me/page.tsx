import type { Metadata } from "next";
import { signOut } from "@/app/actions/auth";
import { setMinutes } from "@/app/actions/sync";
import { SubmitButton } from "@/components/form";
import { SyncButton } from "@/components/leetcode/sync-button";
import { PageHeader } from "@/components/page-header";
import { leetcodeStatus, syncedWithoutTime } from "@/lib/activity/queries";
import { syncEnabled } from "@/lib/activity/service";
import { requireViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Me" };

const CHIPS = [15, 30, 45, 60];

export default async function MePage() {
  const viewer = await requireViewer();
  const enabled = syncEnabled();
  const [status, pendingTime] = enabled ? await Promise.all([leetcodeStatus(viewer.id), syncedWithoutTime(viewer.id)]) : [null, []];
  const t = status?.totals;

  return (
    <>
      <PageHeader title="Me" />
      <p className="text-text-2">Readiness, trends and friends arrive soon.</p>

      {enabled && (
        <section className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-heading font-semibold">LeetCode</h2>
              <p className="text-small text-mute">
                {status?.unavailable ? "LeetCode sync unavailable; retrying daily." : status?.lastSuccessAt ? "Synced recently" : "Not synced yet"}
              </p>
            </div>
            <SyncButton />
          </div>

          {t && (
            <div className="grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-surface">
              {(["easy", "medium", "hard"] as const).map((d) => (
                <div key={d} className="flex flex-col gap-1.5 p-4">
                  <span className="text-small capitalize text-mute">{d}</span>
                  <span className="font-display text-display font-bold tabular">{t.accepted[d] ?? 0}</span>
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
                    {c.title} · {c.result === "solved" ? (c.attempts && c.attempts > 1 ? `solved after ${c.attempts} tries` : "solved first try") : "not solved"}
                  </span>
                  <form action={setMinutes} className="flex gap-2">
                    <input type="hidden" name="checkinId" value={c.id} />
                    {CHIPS.map((m) => {
                      const suggested = c.suggested && Math.abs(c.suggested - m) <= 7;
                      return (
                        <button key={m} name="minutes" value={m}
                          className={`h-9 flex-1 rounded-lg border text-small font-semibold ${suggested ? "border-cyan bg-cyan-bg text-cyan" : "border-line-2 text-text-2"}`}>
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

      <form action={signOut}>
        <SubmitButton pendingLabel="Signing out…" className="h-10 rounded-xl border border-line-2 px-4 text-small font-semibold text-text-2 disabled:opacity-60">
          Sign out
        </SubmitButton>
      </form>
    </>
  );
}
