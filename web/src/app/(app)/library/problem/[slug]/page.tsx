import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { button } from "@/components/button-styles";
import { CheckinPanel } from "@/components/library/checkin-panel";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { syncEnabled } from "@/lib/activity/service";
import { requireViewer } from "@/lib/auth/viewer";
import { ago, relative } from "@/lib/format/time";
import { problemDetail } from "@/lib/library/queries";
import { LANGUAGE_LABEL } from "@/lib/setup";

export async function generateMetadata({ params }: PageProps<"/library/problem/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug.replace(/-/g, " ") };
}

const RESULT_LABEL: Record<string, string> = { solved: "solved", hints: "solved with hints", failed: "didn't solve" };
// Lowercase, for the right-aligned "Last:" meta ("Last: hints · 3d ago").
const LAST_RESULT: Record<string, string> = { solved: "solved", hints: "hints", failed: "missed" };

/** The external-link mark on "Open on LeetCode" (one of the shared icons). */
function ExternalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 5h5v5" />
      <path d="M19 5l-8 8" />
      <path d="M18 13v6H5V6h6" />
    </svg>
  );
}

export default async function ProblemPage({ params }: PageProps<"/library/problem/[slug]">) {
  const viewer = await requireViewer();
  const { slug } = await params;
  const detail = await problemDetail(slug, viewer.id);
  if (!detail) notFound();
  const { problem, pattern, mine, friends, tricks } = detail;
  const solutions = (problem.solutions ?? {}) as Record<string, string>;
  const lang = viewer.language && solutions[viewer.language] ? viewer.language : Object.keys(solutions)[0];
  const leetcodeUrl = problem.kind === "leetcode" ? `https://leetcode.com/problems/${problem.slug}/` : problem.url;
  const last = mine[0] ? `${LAST_RESULT[mine[0].result] ?? mine[0].result} · ${relative(mine[0].createdAt)}` : null;

  return (
    <>
      <div className="flex flex-col gap-2">
        <BackLink href={pattern ? `/library?area=dsa&pattern=${pattern.slug}` : "/library"}>{pattern?.name ?? "Library"}</BackLink>
        <PageHeader
          title={problem.title}
          action={
            leetcodeUrl ? (
              <span className="hidden lg:inline-flex">
                <a href={leetcodeUrl} target="_blank" rel="noreferrer" className={button({ variant: "primary", size: "sm" })}>
                  <ExternalIcon />
                  Open on LeetCode
                </a>
              </span>
            ) : undefined
          }
        />
        <p className="text-small text-mute">
          {problem.lcNumber ? `LeetCode ${problem.lcNumber} · ` : ""}
          {problem.difficulty}
          {problem.nc150 ? " · NeetCode 150" : ""}
          {problem.premium ? " · Premium" : ""}
          {problem.techniques?.length ? ` · ${problem.techniques.join(", ")}` : ""}
        </p>
        {/* On a phone the first, obvious action is full-width under the title. */}
        {leetcodeUrl && (
          <div className="lg:hidden">
            <a href={leetcodeUrl} target="_blank" rel="noreferrer" className={`${button({ variant: "primary" })} w-full`}>
              <ExternalIcon />
              Open on LeetCode
            </a>
          </div>
        )}
      </div>

      {/* Phone order: Open on LeetCode → Check-in → The idea → statement →
          Reference solution. The check-in card is the first cell on a phone and
          the top-right cell on desktop; the reading column spans both rows. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <div className="lg:col-start-2 lg:row-start-1">
          <CheckinPanel slug={problem.slug} patternSlug={pattern?.slug ?? null} syncEnabled={syncEnabled()} last={last} />
        </div>

        <div className="flex flex-col gap-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {tricks.length > 0 && (
            <section className="rounded-xl border border-line bg-surface p-5">
              <h2 className="font-display text-heading font-semibold">The idea</h2>
              <p className="mt-2 text-small text-text-2">
                {pattern && <span className="font-semibold text-text">{pattern.name}</span>}
                {pattern && " · "}
                {tricks.map((t) => t.name).join(", ")}. {tricks.map((t) => t.idea).join(" ")}
              </p>
            </section>
          )}
          {problem.statementMd ? (
            <section className="rounded-xl border border-line bg-surface p-5">
              <Markdown>{problem.statementMd}</Markdown>
            </section>
          ) : (
            <p className="rounded-xl border border-line bg-surface p-5 text-text-2">
              This is a LeetCode Premium problem. Open it on LeetCode to read the statement.
            </p>
          )}
          {lang && (
            <details className="group rounded-xl border border-line bg-surface">
              <summary className="cursor-pointer list-none p-4 font-semibold text-text">
                Reference solution ({LANGUAGE_LABEL[lang] ?? lang}){" "}
                <span className="text-small text-mute group-open:hidden">· tap to show</span>
              </summary>
              <pre className="overflow-x-auto border-t border-line p-4 text-small leading-relaxed text-text">{solutions[lang]}</pre>
            </details>
          )}
        </div>

        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-2">
          <div className="flex flex-col rounded-xl border border-line bg-surface">
            <Link
              href={`/library/problem/${problem.slug}/review`}
              className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-2"
            >
              <span className="font-semibold text-text">Review solution</span>
              <span aria-hidden className="text-mute">
                →
              </span>
            </Link>
            {pattern && (
              <Link
                href={`/coach?kind=lesson&ref=${pattern.slug}`}
                className="flex items-center justify-between gap-3 border-t border-line px-4 py-3.5 hover:bg-surface-2"
              >
                <span className="font-semibold text-text">Learn the pattern</span>
                <span aria-hidden className="text-mute">
                  →
                </span>
              </Link>
            )}
          </div>
          {problem.videoId && (
            <a
              href={`https://www.youtube.com/watch?v=${problem.videoId}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-line bg-surface p-4 font-semibold text-text hover:bg-surface-2"
            >
              NeetCode video explanation ↗
            </a>
          )}
          {(mine.length > 0 || friends.length > 0) && (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 text-small">
              {mine.map((c) => (
                <p key={c.id} className="text-text-2">
                  You {RESULT_LABEL[c.result]}
                  {c.minutes ? ` in ${c.minutes}m` : ""}, {ago(c.createdAt)}
                  {c.note ? ` · “${c.note}”` : ""}
                </p>
              ))}
              {friends.map((f, i) => (
                <p key={i} className="text-mute">
                  {f.name || "A friend"} {RESULT_LABEL[f.result]}
                  {f.minutes ? ` in ${f.minutes}m` : ""}, {ago(f.createdAt)}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
