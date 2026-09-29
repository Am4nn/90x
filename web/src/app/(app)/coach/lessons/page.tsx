import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { button } from "@/components/button-styles";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/auth/viewer";
import type { Mastery } from "@/lib/library/map-layout";
import { AREAS, patternMap, type PatternNode } from "@/lib/library/queries";
import { weakestPatterns } from "@/lib/tracker/me-rules";

export const metadata: Metadata = { title: "Lessons" };

// The mastery column: one word and the colour that carries it (Pattern Map vocabulary).
const MASTERY: Record<Mastery, { label: string; className: string }> = {
  mastered: { label: "mastered", className: "text-ok" },
  weak: { label: "weak", className: "text-bad" },
  started: { label: "started", className: "text-text-2" },
  untouched: { label: "not started", className: "text-mute" },
};

// DSA is this page. Competitive is problems, not lessons, so it does not belong here.
const OTHER_AREAS = AREAS.filter((a) => a.key !== "dsa" && a.key !== "competitive")
  .map((a) => a.label)
  .join(" · ");

/** One pattern: name, mastery, and the one action - the lesson flow that already exists. */
function PatternRow({ node, detail }: { node: PatternNode; detail?: string }) {
  const state = MASTERY[node.state];
  return (
    <li className="flex items-center justify-between gap-3 border-t border-line px-4 py-3.5 first:border-0">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-semibold text-text">{node.name}</span>
        {detail && <span className="text-small text-mute">{detail}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <span className={`text-small ${state.className}`}>{state.label}</span>
        <Link
          href={`/coach?kind=lesson&ref=${node.slug}`}
          aria-label={`Teach me ${node.name}`}
          className="text-small font-semibold text-cyan hover:underline"
        >
          Teach me
        </Link>
      </span>
    </li>
  );
}

export default async function LessonsPage() {
  const viewer = await requireViewer();
  const map = await patternMap(viewer.id);
  const weakest = weakestPatterns(map.patterns, 3);
  const mastered = map.patterns.filter((p) => p.state === "mastered").length;

  const weakestSection =
    weakest.length > 0 ? (
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-heading font-semibold">Worth fixing first</h2>
          <span className="text-small text-mute">your weakest patterns</span>
        </div>
        <ul aria-label="Your weakest patterns" className="flex flex-col rounded-xl border border-line bg-surface">
          {weakest.map((p) => (
            <PatternRow key={p.slug} node={p} detail={p.detail} />
          ))}
        </ul>
      </section>
    ) : (
      <EmptyState title="Nothing to flag yet">Patterns you struggle with show up here after a few check-ins.</EmptyState>
    );

  const indexSection = (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-heading font-semibold">All patterns</h2>
        <span className="text-small text-mute">
          {mastered} of {map.patterns.length} mastered
        </span>
      </div>
      {map.patterns.length > 0 ? (
        <ul aria-label="All patterns" className="flex flex-col rounded-xl border border-line bg-surface">
          {map.patterns.map((p) => (
            <PatternRow key={p.slug} node={p} />
          ))}
        </ul>
      ) : (
        <EmptyState title="No patterns yet">The pattern index is still being written.</EmptyState>
      )}
    </section>
  );

  return (
    <>
      <div className="flex flex-col gap-2">
        <BackLink href="/coach">Coach</BackLink>
        <PageHeader title="Lessons" />
        <p className="text-small text-mute">Every pattern has a sourced lesson Coach can teach you.</p>
      </div>

      {/* A new account has no check-ins, so weakestPatterns returns nothing: the index is
          the useful content and must lead, with the empty state in the weakest slot.
          Once there are weak patterns, they lead and the index follows. */}
      {weakest.length > 0 && weakestSection}
      {indexSection}
      {weakest.length === 0 && weakestSection}

      <section className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3.5">
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold text-text">Other areas</span>
          <span className="text-small text-mute">{OTHER_AREAS}</span>
        </span>
        <Link href="/library" className={button({ size: "sm" })}>
          Library
        </Link>
      </section>
    </>
  );
}
