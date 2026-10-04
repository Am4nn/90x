import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { ratedCards } from "@/lib/admin/cards";
import { areaDot } from "@/lib/admin/review";
import { requireViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Rated cards" };

export default async function RatedPage() {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  const list = await ratedCards();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <PageHeader
        title="Rated"
        action={
          <Link href="/admin/cards/flagged" className="text-small font-semibold text-text-2 hover:text-text">
            Flagged
          </Link>
        }
      />
      <p className="text-small text-mute">Cards readers rated, lowest average first. Bad is 1-2 stars, Normal is 3, Good is 4-5.</p>
      {list.length === 0 && <EmptyState title="No ratings yet">Readers rate a card after answering it.</EmptyState>}
      {list.map((c) => (
        <article key={c.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-small font-semibold text-text-2">
              <span className={`size-2 shrink-0 rounded-full ${areaDot(c.domain)}`} />
              <span className="truncate">{c.topic}</span>
            </span>
            <span className="tabular text-small text-mute">
              {c.avg.toFixed(1)} avg · {c.n} {c.n === 1 ? "rating" : "ratings"}
            </span>
          </header>
          <div className="line-clamp-3 text-text">
            <Markdown>{c.promptMd}</Markdown>
          </div>
          <p className="tabular text-small text-text-2">
            <span className="text-bad">{c.bad} bad</span> · {c.normal} normal · <span className="text-ok">{c.good} good</span>
          </p>
        </article>
      ))}
    </main>
  );
}
