import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import type { AreaRow, PersonRow } from "@/lib/tracker/me";
import { band } from "@/lib/tracker/readiness";

// Me dashboard pieces: readiness dial coloured by band,
// area bars in topic colours with status-coloured numbers.

const BAND_STROKE = { bad: "var(--x-bad)", warn: "var(--x-warn)", ok: "var(--x-ok)" } as const;
const BAND_TEXT = { bad: "text-bad", warn: "text-warn", ok: "text-ok" } as const;
const AREA = {
  dsa: { label: "DSA", bar: "bg-topic-dsa" },
  system_design: { label: "Design", bar: "bg-topic-sd" },
  cs: { label: "CS", bar: "bg-topic-cs" },
  java: { label: "Java", bar: "bg-topic-java" },
  sql: { label: "SQL", bar: "bg-topic-sql" },
} as Record<string, { label: string; bar: string }>;

export function Dial({ value }: { value: number | null }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : value / 100;
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--x-surface-2)" strokeWidth="8" />
        {value != null && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={BAND_STROKE[band(value)]}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`tabular font-display text-dial font-bold ${value == null ? "text-mute" : ""}`}>{value ?? "—"}</span>
        <span className="text-small text-mute">Readiness</span>
      </div>
    </div>
  );
}

export function Trend({ points }: { points: { date: string; overall: number | null }[] }) {
  const values = points.filter((p) => p.overall != null) as { date: string; overall: number }[];
  if (values.length < 2) return <span className="text-small text-mute">The 14-day trend fills in as you practise.</span>;
  const w = 160;
  const h = 40;
  const min = Math.min(...values.map((v) => v.overall));
  const max = Math.max(...values.map((v) => v.overall));
  const span = Math.max(1, max - min);
  const d = values
    .map((v, i) => `${i ? "L" : "M"}${(i / (values.length - 1)) * w},${h - ((v.overall - min) / span) * (h - 4) - 2}`)
    .join(" ");
  const change = values[values.length - 1].overall - values[0].overall;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-40" aria-label="Readiness, last 14 days">
        <path d={d} fill="none" stroke="var(--x-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`text-small font-semibold ${change > 0 ? "text-ok" : change < 0 ? "text-bad" : "text-mute"}`}>
        {change > 0 ? `+${change}` : change} in 14 days
      </span>
    </div>
  );
}

export function AreaBars({ areas }: { areas: AreaRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      {areas.map((a) => {
        const meta = AREA[a.key] ?? { label: a.key, bar: "bg-mute" };
        const width = Math.round(a.score ?? a.coverage * 100);
        return (
          <div key={a.key} className="grid grid-cols-[64px_1fr_auto] items-center gap-3">
            <span className="text-small font-semibold text-text-2">{meta.label}</span>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full ${meta.bar} ${a.score == null ? "opacity-40" : ""}`}
                style={{ width: `${Math.max(width, 0)}%` }}
              />
            </div>
            <span
              className={`tabular w-24 text-right text-small font-semibold ${a.score == null ? "text-mute" : BAND_TEXT[band(a.score)]}`}
            >
              {a.score != null ? a.score : a.coverage > 0 ? `${Math.round(a.coverage * 100)}% studied` : "No data yet"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Scoreboard({ people }: { people: PersonRow[] }) {
  if (people.length < 2)
    return <EmptyState title="Just you so far">Friends show up here once they&apos;re approved and set up.</EmptyState>;
  const rows: { label: string; value: (p: PersonRow) => string }[] = [
    { label: "Readiness", value: (p) => (p.readiness == null ? "—" : String(p.readiness)) },
    { label: "Streak", value: (p) => String(p.streak) },
    { label: "Solved this week", value: (p) => String(p.solvedThisWeek) },
  ];
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full text-small">
        <thead>
          <tr className="text-mute">
            <th className="px-4 py-3 text-left font-semibold">
              <span className="sr-only">Measure</span>
            </th>
            {people.map((p) => (
              <th key={p.userId} className={`px-4 py-3 text-right font-semibold ${p.isMe ? "text-cyan" : ""}`}>
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
              <td className="px-4 py-3 text-text-2">{r.label}</td>
              {people.map((p) => (
                <td key={p.userId} className="tabular px-4 py-3 text-right font-semibold text-text">
                  {r.value(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const RESULT_TEXT = { solved: "Solved", hints: "Solved with hints", failed: "Attempted" } as Record<string, string>;

export function Activity({
  items,
}: {
  items: { id: string; name: string; title: string; slug: string; result: string; minutes: number | null; createdAt: string }[];
}) {
  if (!items.length) return <EmptyState title="No friend activity yet">Their check-ins show up here (never their notes).</EmptyState>;
  return (
    <ul className="flex flex-col rounded-xl border border-line bg-surface">
      {items.map((a) => (
        <li key={a.id} className="flex items-start gap-3 border-t border-line px-4 py-3.5 first:border-0">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 font-display text-small font-bold text-text-2">
            {a.name.slice(0, 1).toUpperCase() || "?"}
          </span>
          <div className="min-w-0">
            <div className="truncate">
              <span className="text-text-2">{RESULT_TEXT[a.result] ?? a.result} </span>
              <Link href={`/library/problem/${a.slug}`} className="font-semibold text-text hover:text-cyan">
                {a.title}
              </Link>
            </div>
            <div className="text-small text-mute">
              {a.name.split(" ")[0]}
              {a.minutes ? ` · ${a.minutes}m` : ""} · {new Date(a.createdAt).toLocaleDateString("en", { month: "short", day: "numeric" })}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
