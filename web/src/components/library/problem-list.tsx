import Link from "next/link";
import { DIFFICULTY, STATUS_ICON } from "@/components/library/palette";
import type { ProblemRow } from "@/lib/library/queries";

// A list of problems: one bordered panel, a row per problem with its
// status icon, title and a meta line. DSA rows say "Medium · NeetCode 150 · 41 companies";
// Competitive ones add the problem's tags.

const SPOKEN: Record<NonNullable<ProblemRow["status"]> | "todo", string> = {
  solved: "Solved",
  hints: "Solved with hints",
  failed: "Missed",
  todo: "Not tried",
};

function StatusIcon({ status }: { status: ProblemRow["status"] }) {
  const s = status ?? "todo";
  return (
    <span className={`grid size-4.5 shrink-0 place-items-center rounded-full border-[1.5px] text-background ${STATUS_ICON[s]}`}>
      {s === "solved" && (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden className="size-2.5">
          <path d="M3 8.5l3.2 3.2L13 4.8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {s === "failed" && (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden className="size-2.25">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      )}
      {s === "hints" && (
        // A 7 x 2.5 bar, as in the mock: too fine for the spacing scale, so it is drawn.
        <svg viewBox="0 0 10 10" aria-hidden className="size-2.5">
          <rect x="1.5" y="3.75" width="7" height="2.5" rx="1" fill="currentColor" />
        </svg>
      )}
      <span className="sr-only">{SPOKEN[s]}</span>
    </span>
  );
}

export function ProblemList({ rows, empty, tags = false, label }: { rows: ProblemRow[]; empty: string; tags?: boolean; label: string }) {
  if (rows.length === 0) return <p className="rounded-xl border border-line bg-surface p-4 text-small text-mute">{empty}</p>;
  return (
    <ul aria-label={label} className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
      {rows.map((r) => {
        const meta = [
          r.nc150 ? "NeetCode 150" : null,
          r.companies ? `${r.companies} companies` : null,
          tags && r.techniques.length ? r.techniques.join(", ") : null,
        ].filter(Boolean);
        return (
          <li key={r.slug} className="border-t border-line first:border-t-0">
            <Link href={`/library/problem/${r.slug}`} className="flex items-center gap-3 px-4 py-3.25 hover:bg-surface-2">
              <StatusIcon status={r.status} />
              <span className="flex min-w-0 flex-col gap-0.75">
                <span className="truncate text-body leading-tight font-semibold text-text">{r.title}</span>
                <span className="truncate text-tag leading-tight font-medium text-mute">
                  {r.difficulty && <span className={DIFFICULTY[r.difficulty] ?? ""}>{r.difficulty}</span>}
                  {meta.map((m) => ` · ${m}`)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
