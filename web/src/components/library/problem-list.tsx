import Link from "next/link";
import type { ProblemRow } from "@/lib/library/queries";

const STATUS: Record<string, { label: string; cls: string }> = {
  solved: { label: "Solved", cls: "text-ok" },
  hints: { label: "With hints", cls: "text-warn" },
  failed: { label: "Failed", cls: "text-bad" },
};

export function ProblemList({ rows, empty }: { rows: ProblemRow[]; empty: string }) {
  if (rows.length === 0) return <p className="rounded-xl border border-line bg-surface p-4 text-small text-mute">{empty}</p>;
  return (
    <div className="divide-y divide-line rounded-xl border border-line bg-surface">
      {rows.map((r) => {
        const s = r.status ? STATUS[r.status] : null;
        return (
          <Link key={r.slug} href={`/library/problem/${r.slug}`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3.5 hover:bg-surface-2">
            <span className="truncate font-semibold text-text">{r.title}</span>
            <span className={`row-span-2 text-small font-semibold ${s?.cls ?? "text-mute"}`}>{s?.label ?? (r.premium ? "Premium" : "")}</span>
            <span className="truncate text-small text-mute">
              {r.difficulty}
              {r.nc150 ? " · NeetCode 150" : ""}
              {r.companies ? ` · ${r.companies} companies` : ""}
              {r.techniques.length ? ` · ${r.techniques.slice(0, 2).join(", ")}` : ""}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
