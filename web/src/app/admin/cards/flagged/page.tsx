import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { flaggedCards } from "@/lib/admin/cards";
import { areaDot } from "@/lib/admin/review";
import { requireViewer } from "@/lib/auth/viewer";
import { ago } from "@/lib/format/time";
import { FlagActions } from "./flag-actions";

export const metadata: Metadata = { title: "Flagged cards" };

export default async function FlaggedPage() {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  const list = await flaggedCards();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <PageHeader
        title="Flagged"
        action={
          <span className="flex gap-4">
            <Link href="/admin/cards/rated" className="text-small font-semibold text-text-2 hover:text-text">
              Rated
            </Link>
            <Link href="/admin/cards" className="text-small font-semibold text-text-2 hover:text-text">
              All batches
            </Link>
          </span>
        }
      />
      <p className="text-small text-mute">
        These cards are hidden from everyone&apos;s feed. Keep puts a card back and clears its reports; Retire removes it for good.
      </p>
      {list.length === 0 && (
        <EmptyState title="Nothing flagged">When a card is reported twice it leaves the feed and waits here.</EmptyState>
      )}
      {list.map((c) => (
        <article key={c.id} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-small font-semibold text-text-2">
              <span className={`size-2 shrink-0 rounded-full ${areaDot(c.domain)}`} />
              <span className="truncate">{c.topic}</span>
              <span className="text-mute capitalize">· {c.format}</span>
            </span>
            <span className="tabular text-small text-mute">
              {c.flagCount} {c.flagCount === 1 ? "report" : "reports"}
            </span>
          </header>
          <div className="text-text">
            <Markdown>{c.promptMd}</Markdown>
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <span className="text-tag text-mute uppercase">Answer</span>
            <Markdown>{c.answerMd}</Markdown>
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <span className="text-tag text-mute uppercase">Reports</span>
            {c.reasons.length === 0 ? (
              <p className="text-small text-mute">No reports. It was hidden because everyone who met it skipped it for 14 days.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {c.reasons.map((r, i) => (
                  <li key={i} className="flex flex-col">
                    <span className="text-text-2">{r.reason}</span>
                    <span className="text-small text-mute">
                      {r.by} · {ago(r.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <FlagActions cardId={c.id} />
        </article>
      ))}
    </main>
  );
}
