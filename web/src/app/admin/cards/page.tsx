import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { type BatchRow, flaggedCount, listBatches } from "@/lib/admin/cards";
import { areaDot, groupByArea } from "@/lib/admin/review";
import { requireViewer } from "@/lib/auth/viewer";
import { PASS_AT, SAMPLE_SIZE } from "@/lib/feed/review-sample";
import { AdminNav } from "../admin-nav";
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
  const viewer = await requireViewer();
  if (!viewer.isAdmin) notFound();
  const [batches, flagged] = await Promise.all([listBatches(), flaggedCount()]);
  const groups = groupByArea(batches);
  const waiting = batches.filter((b) => b.status === "draft").length;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8">
      <PageHeader title="Cards" action={<AdminNav current="Cards" />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <p className="text-small text-mute">
            Each batch shows you {SAMPLE_SIZE} cards, the riskiest first. {PASS_AT} good publishes the whole batch; fewer rejects it.
          </p>
          {groups.length === 0 && (
            <EmptyState title="No batches yet">Draft batches show up here.</EmptyState>
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
          {batches.length > 0 && (
            <p className="text-small text-mute">{waiting === 0 ? "Every batch is decided." : `${waiting} batches still in draft.`}</p>
          )}
        </aside>
      </div>
    </main>
  );
}
