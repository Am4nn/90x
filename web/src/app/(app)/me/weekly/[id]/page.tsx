import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { WeeklyDecision } from "@/components/coach/weekly-decision";
import { EmptyState } from "@/components/empty-state";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/auth/viewer";
import { weeklyView } from "@/lib/coach/weekly";
import { band } from "@/lib/tracker/readiness";
import type { SlotType } from "@/lib/tracker/template";

export const metadata: Metadata = { title: "Weekly review" };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SLOT_LABEL: Record<SlotType, string> = { new_problem: "New problems", review: "Reviews", topic: "Topics", cards: "Card sets" };
const BAND_TEXT = { bad: "text-bad", warn: "text-warn", ok: "text-ok" } as const;

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
  const review = parsed.success ? await weeklyView(viewer.id, parsed.data) : null;
  if (!review) notFound();
  const week = new Date(`${review.weekStart}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/me" className="text-small text-mute hover:text-text-2">
          ← Me
        </Link>
        <PageHeader title={`Week of ${week}`} />
      </div>

      <div className="grid gap-6 md:grid-cols-2 md:gap-8">
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
                        {DAY_NAMES[c.weekday]} · {SLOT_LABEL[c.slot]}
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
