import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckinPanel } from "@/components/library/checkin-panel";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/auth/viewer";
import { problemDetail } from "@/lib/library/queries";

export async function generateMetadata({ params }: PageProps<"/library/problem/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug.replace(/-/g, " ") };
}

const LANG_LABEL: Record<string, string> = { java: "Java", python: "Python", cpp: "C++", javascript: "JavaScript" };
const RESULT_LABEL: Record<string, string> = { solved: "solved", hints: "solved with hints", failed: "didn't solve" };

function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
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

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href={pattern ? `/library?area=dsa&pattern=${pattern.slug}` : "/library"} className="text-small text-mute hover:text-text-2">
          ← {pattern?.name ?? "Library"}
        </Link>
        <PageHeader title={problem.title} />
        <p className="text-small text-mute">
          {problem.lcNumber ? `LeetCode ${problem.lcNumber} · ` : ""}
          {problem.difficulty}
          {problem.nc150 ? " · NeetCode 150" : ""}
          {problem.premium ? " · Premium" : ""}
          {problem.techniques?.length ? ` · ${problem.techniques.join(", ")}` : ""}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-6">
          {problem.statementMd ? (
            <section className="rounded-xl border border-line bg-surface p-5">
              <Markdown>{problem.statementMd}</Markdown>
            </section>
          ) : (
            <p className="rounded-xl border border-line bg-surface p-5 text-text-2">
              This is a LeetCode Premium problem. Open it on LeetCode to read the statement.
            </p>
          )}
          {tricks.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-heading font-semibold">Tricks it uses</h2>
              {tricks.map((t) => (
                <div key={t.name} className="rounded-xl border border-line bg-surface p-4">
                  <div className="font-semibold text-text">{t.name}</div>
                  <p className="mt-1 text-small text-text-2">{t.idea}</p>
                </div>
              ))}
            </section>
          )}
          {lang && (
            <details className="group rounded-xl border border-line bg-surface">
              <summary className="cursor-pointer list-none p-4 font-semibold text-text">
                Reference solution ({LANG_LABEL[lang] ?? lang}){" "}
                <span className="text-small text-mute group-open:hidden">· tap to show</span>
              </summary>
              <pre className="overflow-x-auto border-t border-line p-4 text-small leading-relaxed text-text">{solutions[lang]}</pre>
            </details>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <CheckinPanel slug={problem.slug} leetcodeUrl={leetcodeUrl} />
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
        </aside>
      </div>
    </>
  );
}
