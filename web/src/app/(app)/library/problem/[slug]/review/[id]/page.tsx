import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BackLink } from "@/components/back-link";
import { CodeWithNotes } from "@/components/coach/code-with-notes";
import { QueueButton } from "@/components/coach/queue-button";
import { EmptyState } from "@/components/empty-state";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/auth/viewer";
import { getSolutionReview } from "@/lib/coach/solution-review";
import { LANGUAGE_LABEL } from "@/lib/setup";
import { activeCampaign } from "@/lib/tracker/campaign";

export const metadata: Metadata = { title: "Solution review" };

const SECONDARY = "flex h-11 items-center justify-center rounded-xl border border-line-2 px-5 font-semibold text-text hover:bg-surface-2";

function Complexity({ label, time, space, tone }: { label: string; time: string; space: string; tone: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
      <span className="text-tag font-semibold tracking-wide text-mute uppercase">{label}</span>
      <div className="flex flex-col gap-1">
        <span className={`font-display text-heading font-semibold ${tone}`}>Time {time}</span>
        <span className="text-small text-text-2">Space {space}</span>
      </div>
    </div>
  );
}

export default async function SolutionReviewPage({ params }: PageProps<"/library/problem/[slug]/review/[id]">) {
  const viewer = await requireViewer();
  const { slug, id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [saved, campaign] = await Promise.all([getSolutionReview(viewer.id, id), activeCampaign(viewer.id)]);
  if (!saved || saved.problem.slug !== slug) notFound();
  const { review, problem, pattern, next } = saved;
  const { yours, best } = review.complexity;
  const matchesBest = yours.time === best.time && yours.space === best.space;

  return (
    <>
      <div className="flex flex-col gap-2">
        <BackLink href={`/library/problem/${problem.slug}`}>{problem.title}</BackLink>
        <PageHeader
          title="Solution review"
          action={
            <Link href={`/coach?kind=review&ref=${saved.id}`} className="text-small font-semibold text-cyan hover:underline">
              Discuss with Coach
            </Link>
          }
        />
        <p className="text-small text-mute">
          {LANGUAGE_LABEL[saved.language] ?? saved.language} · {problem.difficulty}
          {pattern ? ` · ${pattern.name}` : ""}
        </p>
      </div>

      <section className="grid gap-3 md:grid-cols-3" aria-label="Verdict and complexity">
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
          <span className="text-tag font-semibold tracking-wide text-mute uppercase">Verdict</span>
          <span className={`font-display text-title font-semibold ${review.correct ? "text-ok" : "text-bad"}`}>
            {review.correct ? "Correct" : "Not correct"}
          </span>
        </div>
        <Complexity label="Yours" time={yours.time} space={yours.space} tone={matchesBest ? "text-ok" : "text-warn"} />
        <Complexity label="Best known" time={best.time} space={best.space} tone="text-text" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-heading font-semibold">Your code</h2>
          <CodeWithNotes code={saved.code} notes={review.lineNotes} />
          {review.lineNotes.length === 0 && <p className="text-small text-mute">No line notes: nothing specific to fix.</p>}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
            <h2 className="font-display text-heading font-semibold">Better approach</h2>
            {review.betterApproach ? (
              <Markdown>{review.betterApproach}</Markdown>
            ) : (
              <p className="text-text-2">Your approach is already the best known one.</p>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <h2 className="font-display text-heading font-semibold">The idea to keep</h2>
            <p className="text-text-2">{review.patternLesson}</p>
            {pattern && (
              <Link href={`/coach?kind=lesson&ref=${pattern.slug}`} className={SECONDARY}>
                Teach me {pattern.name}
              </Link>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <h2 className="font-display text-heading font-semibold">Next problem</h2>
            {next ? (
              <>
                <Link href={`/library/problem/${next.slug}`} className="font-semibold text-text hover:text-cyan">
                  {next.title} <span className="text-small font-normal text-mute">· {next.difficulty}</span>
                </Link>
                {campaign ? (
                  <QueueButton slugs={[next.slug]} from="review" label="Queue next problem" />
                ) : (
                  <Link href={`/library/problem/${next.slug}`} className={SECONDARY}>
                    Open the problem
                  </Link>
                )}
              </>
            ) : (
              <EmptyState title="Nothing left in this pattern">You&apos;ve solved every problem Coach would pick next here.</EmptyState>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
