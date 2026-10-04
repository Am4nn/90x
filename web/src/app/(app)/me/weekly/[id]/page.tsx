import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BackLink } from "@/components/back-link";
import { WeeklyDecision } from "@/components/coach/weekly-decision";
import { EmptyState } from "@/components/empty-state";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/auth/viewer";
import { recentWeekly, weeklyView } from "@/lib/coach/weekly";
import { weekLabel } from "@/lib/coach/weekly-rules";
import { DAY_NAMES_LONG } from "@/lib/tracker/dates";
import { band, BAND_TEXT } from "@/lib/tracker/readiness";
import { SLOT_LABEL } from "@/lib/tracker/template";

export const metadata: Metadata = { title: "Coach's weekly digest" };

function Score({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  return (
    <div className="flex flex-col gap-1.5 p-4">
      <span className="text-small text-mute">{label}</span>
      <span className={`tabular font-display text-display font-bold ${value == null ? "text-mute" : BAND_TEXT[band(value)]}`}>
        {value ?? "—"}
      </span>
      <span className="text-small text-mute">{hint}</span>
    </div>
  );
}

export default async function WeeklyPage({ params }: PageProps<"/me/weekly/[id]">) {
  const viewer = await requireViewer();
  const { id } = await params;
  const parsed = z.uuid().safeParse(id);
  const [review, weeks] = await Promise.all([parsed.success ? weeklyView(viewer.id, parsed.data) : null, recentWeekly(viewer.id)]);
  if (!review) notFound();

  return (
    <>
      <div className="flex flex-col gap-2">
        <BackLink href="/me">Me</BackLink>
        <PageHeader title="Coach's weekly digest" />
      </div>

      {/* The last few weeks, newest first. An older review than these is still reachable by its link. */}
      <nav aria-label="Weeks" className="-mt-2 flex gap-2 overflow-x-auto pb-1">
        {(weeks.some((w) => w.id === review.id) ? weeks : [{ id: review.id, weekStart: review.weekStart }, ...weeks]).map((w) => (
          <Link
            key={w.id}
            href={`/me/weekly/${w.id}`}
            aria-current={w.id === review.id ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-small font-semibold ${
              w.id === review.id ? "border-cyan bg-cyan-bg text-cyan" : "border-line-2 text-text-2 hover:text-text"
            }`}
          >
            {weekLabel(w.weekStart)}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 divide-x divide-line rounded-xl border border-line bg-surface">
            <Score label="Readiness" value={review.formulaScore} hint="The formula on your dial" />
            <Score label="Coach's read" value={review.coachScore} hint="Coach's own estimate" />
          </div>
          <section className="flex flex-col gap-3 text-text-2">
            <Markdown>{review.summaryMd}</Markdown>
          </section>
        </div>

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-display text-heading font-semibold">Suggested plan changes</h2>
            <p className="text-small text-mute">Nothing changes unless you accept. Applies from tomorrow.</p>
          </div>
          {review.changes.length ? (
            <>
              <ul className="flex flex-col rounded-xl border border-line bg-surface">
                {review.changes.map((c) => (
                  <li key={`${c.weekday}-${c.slot}`} className="flex flex-col gap-1 border-t border-line px-4 py-3.5 first:border-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">
                        {DAY_NAMES_LONG[c.weekday]} · {SLOT_LABEL[c.slot]}
                      </span>
                      <span className="tabular font-semibold">
                        <span className="text-mute line-through">{c.from}</span>
                        <span className="text-mute"> → </span>
                        <span className="text-cyan">{c.to}</span>
                      </span>
                    </div>
                    <span className="text-small text-mute">{c.why}</span>
                  </li>
                ))}
              </ul>
              {review.accepted == null ? (
                <WeeklyDecision reviewId={review.id} />
              ) : (
                <p className="text-small text-mute">
                  {review.accepted ? "You accepted these changes." : "You kept your plan as it was."}{" "}
                  <Link href="/me/plan" className="font-semibold text-cyan">
                    Open your plan
                  </Link>
                </p>
              )}
            </>
          ) : (
            <EmptyState title="No changes this week">
              Coach thinks your current plan fits. You can still edit it on the Plan page.
            </EmptyState>
          )}
        </section>
      </div>
    </>
  );
}
