import Link from "next/link";
import type { ReactNode } from "react";
import { ReviewMore } from "@/components/coach/review-more";
import { reviewWhen, verdictOf } from "@/lib/coach/review-list-rules";
import type { ReviewRow } from "@/lib/coach/solution-review";
import { LANGUAGE_LABEL } from "@/lib/setup";

const TONE = { ok: "text-ok", bad: "text-bad", neutral: "text-text-2" } as const;
const FIRST = 5;

function Row({ row, today, timezone, variant }: { row: ReviewRow; today: string; timezone: string; variant: "problem" | "all" }) {
  const language = LANGUAGE_LABEL[row.language] ?? row.language;
  const verdict = verdictOf(row.correct);
  const what = variant === "problem" ? (row.time ? `${language} · ${row.time} time` : language) : `${row.title} · ${language}`;
  return (
    <Link
      href={`/library/problem/${row.problemSlug}/review/${row.id}`}
      className="flex min-h-11 items-center gap-3 border-t border-line px-4 py-2.5 first:border-0 hover:bg-surface-2"
    >
      <span className="w-14 shrink-0 text-small text-mute">{reviewWhen(row.createdAt, today, timezone)}</span>
      <span className="min-w-0 flex-1 truncate text-small text-text">{what}</span>
      <span className={`shrink-0 text-tag font-semibold ${TONE[verdict.tone]}`}>{verdict.label}</span>
      <span aria-hidden className="text-mute">
        →
      </span>
    </Link>
  );
}

/** The viewer's saved solution reviews, each a way back to the review. Renders nothing when there are none. */
export function ReviewList({
  rows,
  today,
  timezone,
  variant,
}: {
  rows: ReviewRow[];
  today: string;
  timezone: string;
  variant: "problem" | "all";
}) {
  if (!rows.length) return null;
  const title = variant === "problem" ? "Your reviews" : "Solution reviews";
  const render = (list: ReviewRow[]): ReactNode =>
    list.map((r) => <Row key={r.id} row={r} today={today} timezone={timezone} variant={variant} />);
  const shown = variant === "all" ? rows.slice(0, FIRST) : rows;
  const rest = variant === "all" ? rows.slice(FIRST) : [];
  return (
    <section aria-label={title} className="flex flex-col rounded-xl border border-line bg-surface">
      <h2 className="px-4 pt-3.5 pb-2 text-small font-semibold text-text-2">{title}</h2>
      {render(shown)}
      {rest.length > 0 && <ReviewMore total={rows.length}>{render(rest)}</ReviewMore>}
    </section>
  );
}
