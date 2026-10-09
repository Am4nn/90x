import Link from "next/link";
import { HeadphonesIcon } from "@/components/icons";
import { SubCards } from "@/components/library/sub-cards";
import type { TopicGroup, TopicItem } from "@/lib/library/topic-list";

// The topic list for every area but DSA and Competitive: groups of rows in
// one hairlined panel, each row a progress ring, the lesson's title and summary, and its
// sub-cards as chips. The mock's off-palette colours are mixes of the app's own tokens.

// r = 9.5 in a 24px box.
const RING = 2 * Math.PI * 9.5;

function Ring({ done, total }: { done: number; total: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-6 shrink-0 -rotate-90">
      <circle cx="12" cy="12" r="9.5" fill="none" strokeWidth="2" className="stroke-line-2" />
      <circle
        cx="12"
        cy="12"
        r="9.5"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray={`${((RING * done) / total).toFixed(1)} ${RING.toFixed(1)}`}
        // Soft cyan while partial (#4FB3C4), the done green when complete (#5FAE7E).
        className={
          done === 0
            ? "stroke-transparent"
            : done === total
              ? "stroke-[color-mix(in_srgb,color-mix(in_srgb,var(--color-text)_30%,var(--color-ok))_75%,var(--color-surface))]"
              : "stroke-[color-mix(in_srgb,var(--color-surface)_25%,var(--color-cyan))]"
        }
      />
    </svg>
  );
}

function Row({ topic }: { topic: TopicItem }) {
  return (
    <div className="flex items-start gap-3 bg-surface px-4.5 py-4">
      <Ring done={topic.done} total={topic.total} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Link
            href={`/library/topic/${topic.slug}`}
            className="flex min-w-0 items-center gap-1 text-body leading-tight font-semibold text-text hover:text-cyan"
          >
            <span className="text-pretty">{topic.name}</span>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden className="size-3.5 shrink-0 text-mute">
              <path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          {(topic.status || topic.audio) && (
            <span className="flex shrink-0 items-center gap-2 self-center">
              {topic.status && <span className="tabular text-tag font-medium text-mute">{topic.status}</span>}
              {/* On a topic row the mark sits at the end of the title line. */}
              {topic.audio && (
                <span title="Audio lesson" className="text-[color-mix(in_srgb,var(--color-mute)_45%,var(--color-cyan))]">
                  <HeadphonesIcon className="size-3.5" />
                  <span className="sr-only">Audio lesson</span>
                </span>
              )}
            </span>
          )}
        </div>
        {topic.description && <p className="text-small leading-normal font-medium text-pretty text-mute">{topic.description}</p>}
        {topic.subs.length > 0 && <SubCards subs={topic.subs} />}
      </div>
    </div>
  );
}

export function TopicList({ groups }: { groups: TopicGroup[] }) {
  return (
    <div className="flex flex-col gap-7 md:gap-9">
      {groups.map((g) => (
        <section key={g.name} className="flex flex-col gap-3" aria-label={g.name}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-heading font-semibold text-text">{g.name}</h2>
            <span className="tabular text-small font-medium text-mute">
              {g.done} of {g.items.length} done
            </span>
          </div>
          <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-2">
            {g.items.map((t) => (
              <Row key={t.slug} topic={t} />
            ))}
            {/* An odd last row would leave the hairline colour showing in the empty cell. */}
            {g.items.length % 2 === 1 && <div aria-hidden className="hidden bg-surface md:block" />}
          </div>
        </section>
      ))}
    </div>
  );
}
