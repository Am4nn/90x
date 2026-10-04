import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { type BatchRow, flaggedCount, listBatches, ratingTotals } from "@/lib/admin/cards";
import { areaDot, groupByArea } from "@/lib/admin/review";
import { requireAdmin } from "@/lib/auth/viewer";
import { PASS_AT, SAMPLE_SIZE } from "@/lib/feed/review-sample";
import { AdminNav, backToApp } from "../admin-nav";
import { ProgressBar, StatusChip } from "./status-chip";

export const metadata: Metadata = { title: "Cards" };

function BatchLink({ b }: { b: BatchRow }) {
  const reviewed = b.good + b.bad;
  const pass = b.aiPassRate == null ? null : Math.round(b.aiPassRate * 100);
  return (
    <Link href={`/admin/cards/${b.id}`} className="flex flex-col gap-2.5 px-4 py-3.5 hover:bg-surface-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-semibold text-text">
          <span className={`size-2 shrink-0 rounded-full ${areaDot(b.domain)}`} />
          <span className="truncate">{b.label}</span>
        </span>
        <StatusChip status={b.status} />
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <ProgressBar done={reviewed} total={b.sampleSize} label={`${reviewed} of ${b.sampleSize} reviewed`} />
        </div>
        <span className="tabular shrink-0 text-small text-mute">
          {reviewed}/{b.sampleSize}
        </span>
      </div>
      <span className="text-small text-mute">
        {b.cardCount} cards{pass == null ? "" : ` · AI passed ${pass}%`}
        {b.status === "draft" && reviewed > 0 ? ` · ${b.good} good` : ""}
      </span>
    </Link>
  );
}

export default async function AdminCardsPage() {
  await requireAdmin();
  const [batches, flagged, rated] = await Promise.all([listBatches(), flaggedCount(), ratingTotals()]);
  // A batch is waiting for you only while it still holds draft cards. A batch labelled draft whose cards
  // are all live or retired has nothing left to review, so it joins the decided ones.
  const waitingBatches = batches.filter((b) => b.status === "draft" && b.draftCount > 0);
  const decided = batches.filter((b) => !waitingBatches.includes(b));
  const groups = groupByArea(waitingBatches);
  const waiting = waitingBatches.length;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8">
      <PageHeader title="Cards" action={backToApp} />
      <AdminNav current="Cards" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <p className="text-small text-mute">
            Each batch shows you {SAMPLE_SIZE} cards, the riskiest first. {PASS_AT} good publishes the whole batch; fewer rejects it.
          </p>
          {groups.length === 0 && (
            <EmptyState title="Nothing to review">
              Batches with draft cards show up here.
            </EmptyState>
          )}
          {groups.map((g) => (
            <section key={g.key} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-heading font-semibold">{g.label}</h2>
                <span className="text-small text-mute">{g.items.length}</span>
              </div>
              <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {g.items.map((b) => (
                  <BatchLink key={b.id} b={b} />
                ))}
              </div>
            </section>
          ))}
          {decided.length > 0 && (
            <details className="group rounded-xl border border-line bg-surface">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3.5 font-semibold text-text-2 hover:text-text">
                <span>Earlier batches</span>
                <span className="tabular text-small text-mute">{decided.length}</span>
              </summary>
              <div className="divide-y divide-line border-t border-line">
                {decided.map((b) => (
                  <BatchLink key={b.id} b={b} />
                ))}
              </div>
            </details>
          )}
        </div>
        <aside className="flex flex-col gap-3">
          <h2 className="font-display text-heading font-semibold">Flagged</h2>
          <Link
            href="/admin/cards/flagged"
            className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 hover:bg-surface-2"
          >
            <span className="flex flex-col">
              <span className="font-semibold text-text">{flagged === 0 ? "Nothing flagged" : `${flagged} hidden cards`}</span>
              <span className="text-small text-mute">Cards reported twice leave the feed until you decide.</span>
            </span>
            <span className="tabular font-display text-title font-semibold text-text">{flagged}</span>
          </Link>
          <h2 className="mt-3 font-display text-heading font-semibold">Rated</h2>
          <Link
            href="/admin/cards/rated"
            className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 hover:bg-surface-2"
          >
            <span className="flex flex-col">
              <span className="font-semibold text-text">{rated.ratings === 0 ? "No ratings yet" : `${rated.avg}/5 average`}</span>
              <span className="text-small text-mute">
                {rated.ratings === 0
                  ? "Readers rate a card after answering it."
                  : `${rated.ratings} ${rated.ratings === 1 ? "rating" : "ratings"} on ${rated.cards} ${rated.cards === 1 ? "card" : "cards"}.`}
              </span>
            </span>
            <span className="tabular font-display text-title font-semibold text-text">{rated.ratings}</span>
          </Link>
          {batches.length > 0 && (
            <p className="text-small text-mute">
              {waiting === 0 ? "Nothing waiting for review." : `${waiting} ${waiting === 1 ? "batch" : "batches"} waiting for review.`}
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
