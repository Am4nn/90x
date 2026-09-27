import type { BatchStatus } from "@/lib/admin/cards";

const STYLE: Record<BatchStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "border-line-2 text-text-2" },
  published: { label: "Published", className: "border-ok/40 text-ok" },
  rejected: { label: "Rejected", className: "border-bad/40 text-bad" },
};

export function StatusChip({ status }: { status: BatchStatus }) {
  const s = STYLE[status];
  return <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-tag ${s.className}`}>{s.label}</span>;
}

/** Share of the sample reviewed so far. */
export function ProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div className="h-full rounded-full bg-cyan" style={{ width: `${pct}%` }} />
    </div>
  );
}
