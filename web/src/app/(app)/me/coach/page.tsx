import type { Metadata } from "next";
import Link from "next/link";
import { addMemoryNote } from "@/app/actions/coach";
import { button } from "@/components/button-styles";
import { ChipGroup } from "@/components/chip-group";
import { MemoryGroup } from "@/components/coach/memory-list";
import { ReviewList } from "@/components/coach/review-list";
import { EmptyState } from "@/components/empty-state";
import { ActionForm, SubmitButton } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/auth/viewer";
import { listMemory } from "@/lib/coach/memory";
import { MEMORY_KINDS, type MemoryKind } from "@/lib/coach/memory-rules";
import { listSolutionReviews } from "@/lib/coach/solution-review";
import { localDate } from "@/lib/tracker/dates";

export const metadata: Metadata = { title: "What Coach knows" };

const HEADINGS: Record<MemoryKind, string> = {
  habit: "Habits",
  strength: "Strengths",
  goal: "Goals",
  preference: "Preferences",
  context: "Context",
};
const KIND_OPTIONS = MEMORY_KINDS.map((k) => ({ value: k, label: HEADINGS[k].replace(/s$/, "") }));

export default async function CoachMemoryPage() {
  const viewer = await requireViewer();
  const [facts, reviews] = await Promise.all([listMemory(viewer.id, { includeResolved: true }), listSolutionReviews(viewer.id)]);

  return (
    <>
      <PageHeader
        title="What Coach knows"
        action={
          <Link href="/me" className={button({ size: "sm" })}>
            Done
          </Link>
        }
      />
      <p className="text-text-2">
        Coach reads these before every answer. Only you and your coach see them. Fix anything that&apos;s wrong, or delete it.
      </p>

      {facts.length ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
          {MEMORY_KINDS.map((kind) => {
            const group = facts.filter((f) => f.kind === kind);
            return group.length ? <MemoryGroup key={kind} title={HEADINGS[kind]} facts={group} /> : null;
          })}
        </div>
      ) : (
        <EmptyState title="Coach doesn't know anything yet">
          It learns from your chats, solution reviews and mocks. You can also add a note below.
        </EmptyState>
      )}

      <ReviewList rows={reviews} today={localDate(viewer.timezone)} timezone={viewer.timezone} variant="all" />

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-heading font-semibold">Add a note for Coach</h2>
        <ActionForm action={addMemoryNote} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
          <ChipGroup name="kind" label="Kind" options={KIND_OPTIONS} defaultValue="goal" />
          <textarea
            name="text"
            rows={2}
            maxLength={300}
            required
            aria-label="Note"
            placeholder="Amazon onsite on Nov 20"
            className="rounded-xl border border-line-2 bg-background p-3 text-text outline-none focus:border-cyan"
          />
          <SubmitButton pendingLabel="Adding…">Add note</SubmitButton>
        </ActionForm>
      </section>
    </>
  );
}
