import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { batchForReview } from "@/lib/admin/cards";
import { requireAdmin } from "@/lib/auth/viewer";
import { BatchReview } from "./review";

export const metadata: Metadata = { title: "Batch review" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BatchPage({ params }: PageProps<"/admin/cards/[batchId]">) {
  await requireAdmin();
  const { batchId } = await params;
  // A malformed id would make Postgres throw on the uuid cast; treat it as missing.
  if (!UUID.test(batchId)) notFound();
  const data = await batchForReview(batchId);
  if (!data) notFound();
  const { batch, sample } = data;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8">
      <PageHeader
        title={batch.label}
        action={
          <Link href="/admin/cards" className="text-small font-semibold text-text-2 hover:text-text">
            All batches
          </Link>
        }
      />
      {sample.length === 0 ? (
        <EmptyState title="This batch has no cards">Nothing to review in it.</EmptyState>
      ) : (
        <BatchReview batchId={batch.id} status={batch.status} cards={sample} />
      )}
    </main>
  );
}
