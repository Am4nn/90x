import type { XpDay } from "@/lib/xp/series";

const dayLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en", { weekday: "short", timeZone: "UTC" });

/** XP on Me: the running total and a bar for each of the last seven days. */
export function XpWeek({ total, week }: { total: number; week: XpDay[] }) {
  const max = Math.max(1, ...week.map((d) => d.xp));
  const sum = week.reduce((n, d) => n + d.xp, 0);
  return (
    <section className="flex flex-col gap-3" aria-label="XP">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-heading font-semibold">XP</h2>
        <span className="text-small text-mute">{sum} this week</span>
      </div>
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-baseline gap-2">
          <span className="tabular font-display text-title font-bold text-text" data-testid="xp-total">
            {total}
          </span>
          <span className="text-small text-mute">XP in total</span>
        </div>
        <ul className="grid grid-cols-7 gap-2" aria-label="XP, last 7 days">
          {week.map((d, i) => (
            <li key={d.date} className="flex flex-col items-center gap-1.5">
              <span className="tabular text-tag font-semibold text-text-2">{d.xp}</span>
              <div className="flex h-20 w-full items-end">
                <div
                  className={`w-full rounded-sm ${d.xp > 0 ? (i === week.length - 1 ? "bg-cyan" : "bg-cyan/50") : "bg-surface-2"}`}
                  style={{ height: `${d.xp > 0 ? Math.max(6, Math.round((d.xp / max) * 100)) : 4}%` }}
                />
              </div>
              <span className={`text-tag ${i === week.length - 1 ? "font-semibold text-text" : "text-mute"}`}>{dayLabel(d.date)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
