import type { DayCount } from "@/lib/admin/analytics";

const label = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

/** A bar per day, same look as the XP week on Me. One text summary is read out instead of 90 bars. */
export function DayBars({ title, data, unit, format }: { title: string; data: DayCount[]; unit: string; format?: (n: number) => string }) {
  const show = format ?? ((n: number) => String(n));
  const max = Math.max(0, ...data.map((d) => d.n));
  const total = data.reduce((s, d) => s + d.n, 0);
  const first = data[0];
  const last = data[data.length - 1];
  const peak = data.reduce<DayCount | null>((best, d) => (d.n > (best?.n ?? 0) ? d : best), null);
  const summary = `${title}: ${show(total)} ${unit} in total over ${data.length} days${peak ? `, most on ${label(peak.day)} (${show(peak.n)})` : ", none in this range"}.`;
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-small text-text-2">{title}</figcaption>
      <div role="img" aria-label={summary} className="flex h-20 items-end gap-px">
        {data.map((d, i) => (
          <div key={d.day} className="flex h-full min-w-0 flex-1 items-end" title={`${label(d.day)}: ${show(d.n)}`}>
            <div
              className={`w-full rounded-sm ${d.n > 0 ? (i === data.length - 1 ? "bg-cyan" : "bg-cyan/50") : "bg-surface-2"}`}
              style={{ height: `${d.n > 0 && max > 0 ? Math.max(6, Math.round((d.n / max) * 100)) : 4}%` }}
            />
          </div>
        ))}
      </div>
      {first && last && (
        <div className="flex justify-between text-tag text-mute" aria-hidden="true">
          <span>{label(first.day)}</span>
          <span>peak {show(max)}</span>
          <span>{label(last.day)}</span>
        </div>
      )}
    </figure>
  );
}

/** A titled number with an optional detail line. `boxed={false}` leaves out the card, for use inside one. */
export function Stat({ title, value, detail, boxed = true }: { title: string; value: string; detail?: string; boxed?: boolean }) {
  return (
    <div className={boxed ? "flex flex-col gap-1 rounded-xl border border-line bg-surface p-4" : "flex flex-col gap-0.5"}>
      <span className="text-small text-mute">{title}</span>
      <span className="tabular font-display text-title font-bold">{value}</span>
      {detail && <span className="text-small text-text-2">{detail}</span>}
    </div>
  );
}

/** A titled block of the page: heading, optional hint on the right, then the content. */
export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-heading font-semibold">{title}</h2>
        {hint && <span className="text-small text-mute">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** A horizontal bar for a part of a whole, e.g. lifetime AI spend against its ceiling. A tone can be forced,
 *  and the name and value line can be left out when the caller prints its own. */
export function Meter({
  label: name,
  value,
  max,
  text,
  tone: forced,
  showText = true,
}: {
  label: string;
  value: number;
  max: number;
  text: string;
  tone?: "ok" | "warn" | "bad";
  showText?: boolean;
}) {
  const share = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const tone = forced
    ? { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" }[forced]
    : share >= 100
      ? "bg-bad"
      : share >= 80
        ? "bg-warn"
        : "bg-cyan";
  return (
    <div className="flex flex-col gap-1.5">
      {showText && (
        <div className="flex items-baseline justify-between text-small">
          <span className="text-text-2">{name}</span>
          <span className="tabular text-text">{text}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-valuetext={text}
        className="h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}
