import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { ratedCards, ratingTotals } from "@/lib/admin/cards";
import { areaDot } from "@/lib/admin/review";
import { requireViewer } from "@/lib/auth/viewer";
import { ProgressBar } from "../status-chip";
import { RatingStars } from "./rating-stars";

export const metadata: Metadata = { title: "Rated cards" };

export default async function RatedPage() {
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  const [list, totals] = await Promise.all([ratedCards(), ratingTotals()]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <PageHeader
        title="Rated"
        action={
          <span className="flex gap-4">
            <Link href="/admin/cards/flagged" className="text-small font-semibold text-text-2 hover:text-text">
              Flagged
            </Link>
            <Link href="/admin/cards" className="text-small font-semibold text-text-2 hover:text-text">
              All batches
            </Link>
          </span>
        }
      />
      <p className="text-small text-mute">
        {totals.ratings === 0
          ? "Readers rate a card with one to five stars after answering it."
          : `${totals.avg}/5 across ${totals.ratings} ${totals.ratings === 1 ? "rating" : "ratings"} on ${totals.cards} ${totals.cards === 1 ? "card" : "cards"}. Lowest average first.`}
      </p>
      {list.length === 0 && <EmptyState title="No ratings yet">Readers rate a card after answering it.</EmptyState>}
      {list.map((c) => (
        <article key={c.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-small font-semibold text-text-2">
              <span className={`size-2 shrink-0 rounded-full ${areaDot(c.domain)}`} />
              <span className="truncate">{c.topic}</span>
            </span>
            <span className="flex items-center gap-2">
              <RatingStars value={c.avg} />
              <span className="tabular text-small font-semibold text-text">{c.avg}/5</span>
              <span className="text-small text-mute">
                by {c.n} {c.n === 1 ? "reader" : "readers"}
              </span>
            </span>
          </header>
          <div className="line-clamp-3 text-text">
            <Markdown>{c.promptMd}</Markdown>
          </div>
          <ul className="flex flex-col gap-1.5" aria-label="Ratings by star">
            {([5, 4, 3, 2, 1] as const).map((star) => (
              <li key={star} className="flex items-center gap-3 text-small text-text-2">
                <span className="tabular w-8 shrink-0">{star} ★</span>
                <div className="flex-1">
                  <ProgressBar done={c.stars[star - 1] ?? 0} total={c.n} label={`${c.stars[star - 1] ?? 0} readers gave ${star} stars`} />
                </div>
                <span className="tabular w-6 shrink-0 text-right text-mute">{c.stars[star - 1] ?? 0}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </main>
  );
}
