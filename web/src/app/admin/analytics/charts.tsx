import type { DayCount, WeekCohort } from "@/lib/admin/analytics";
import { type CohortCell, cohortCell, dayMonth, MIN_GROUP_FOR_PCT } from "@/lib/admin/analytics-math";
import type { Change } from "@/lib/admin/analytics-words";

// The pieces of /admin/analytics. Server components only: every chart is inline SVG drawn from the numbers,
// no chart library and no client JavaScript. Plot areas stretch (preserveAspectRatio="none", strokes kept
// thin with vector-effect) and every label is HTML on top, so text never scales with the chart. Each chart
// has a text alternative: an SVG with role="img" and a summary label, or a real table or list.

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const usd = (v: number) => `$${v.toFixed(2)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** A rounded maximum for an axis: 4, 5, 10, 20, 25, 50, ... */
function niceMax(m: number): number {
  if (m <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(m));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((v) => v >= m) ?? 10 * p;
}

/** A numbered block of the page with an anchor for the jump links. `level` 3 nests it inside another section. */
export function Section({
  n,
  id,
  title,
  hint,
  level = 2,
  children,
}: {
  n?: number;
  id?: string;
  title: string;
  hint?: string;
  level?: 2 | 3;
  children: React.ReactNode;
}) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <section id={id} className="flex scroll-mt-4 flex-col gap-3" aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <H className="font-display text-heading font-semibold">
          {n !== undefined && (
            <span aria-hidden="true" className="mr-2 text-mute">
              {n}
            </span>
          )}
          {title}
        </H>
        {hint && <span className="text-small text-mute">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** "In plain words: ...", under every chart. */
function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-small text-text-2">
      <span className="text-mute">In plain words: </span>
      {children}
    </p>
  );
}

/** One chart's box: a title, the chart, its caption and an optional small note. */
export function Card({
  title,
  caption,
  note,
  className = "",
  children,
}: {
  title?: string;
  caption?: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-2.5 rounded-xl border border-line bg-surface p-4 ${className}`}>
      {title && <h3 className="font-display text-heading font-semibold">{title}</h3>}
      {children}
      {caption && <Caption>{caption}</Caption>}
      {note && <p className="text-tag leading-label text-mute">{note}</p>}
    </div>
  );
}

/** The dashed box a chart shows instead of itself when there is nothing to draw yet. */
export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-2 px-3.5 py-4 text-center text-small text-text-2">
      <b className="block font-semibold text-text">{title}</b>
      {children}
    </div>
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

/** A thin bar track filled to `value / max`, for rows that print their own numbers (decorative). */
export function Track({ value, max, fill = "fill-cyan", thin = false }: { value: number; max: number; fill?: string; thin?: boolean }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      className={`block w-full overflow-hidden rounded-full ${thin ? "h-1" : "h-2.5"}`}
    >
      <rect width="100" height="10" className="fill-surface-2" />
      {value > 0 && <rect width={Math.max(w, 1.5)} height="10" className={fill} />}
    </svg>
  );
}

/** A small trend line for a tile. Decorative: the tile states the number. */
function Sparkline({ values }: { values: number[] }) {
  const w = 110;
  const h = 34;
  const m = Math.max(1, ...values);
  const step = (w - 6) / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [3 + i * step, h - 4 - (v / m) * (h - 10)] as const);
  const last = pts.at(-1);
  return (
    <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
      <polyline
        points={pts.map((p) => p.join(",")).join(" ")}
        fill="none"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="stroke-cyan"
      />
      {last && <circle cx={last[0]} cy={last[1]} r="3" className="fill-cyan" />}
    </svg>
  );
}

/** "▲ +3 vs last Wednesday (2)": green up, amber down. */
function Delta({ change, before }: { change: Change; before: number }) {
  const look = { up: "text-ok", down: "text-warn", flat: "text-text-2" }[change.dir];
  const arrow = { up: "▲", down: "▼", flat: "=" }[change.dir];
  return (
    <span className="text-small text-text-2">
      <span className={`font-bold ${look}`}>
        <span aria-hidden="true">{arrow} </span>
        {change.text}
      </span>{" "}
      <span className="tabular">({before})</span>
    </span>
  );
}

/** A number tile with a sparkline and the change in words. */
export function Tile({
  label,
  value,
  spark,
  sparkLabel,
  change,
  before,
}: {
  label: string;
  value: number;
  spark: number[];
  sparkLabel: string;
  change: Change;
  before: number;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface p-4">
      <span className="text-small text-mute">{label}</span>
      <div className="flex items-end justify-between gap-3">
        <span className="tabular font-display text-display font-bold">
          {value}
          <small className="ml-1.5 font-sans text-small font-semibold text-mute">{value === 1 ? "person" : "people"}</small>
        </span>
        <span className="flex flex-col items-end">
          <Sparkline values={spark} />
          <i className="text-tag text-mute not-italic">{sparkLabel}</i>
        </span>
      </div>
      <Delta change={change} before={before} />
    </div>
  );
}

const pctAt = (k: number, n: number) => (n <= 1 ? 50 : (k / (n - 1)) * 100);

/** People active each day: a line with a soft area, a dashed launch marker and today's value. With almost no
 *  data (never more than 2 a day) it draws dots instead of a line, as the mock's low-data state does. */
export function LineChart({
  data,
  marker,
  label,
  unit,
}: {
  data: DayCount[];
  marker?: { day: string; label: string };
  label: string;
  unit: [string, string];
}) {
  const vals = data.map((d) => d.n);
  const peak = Math.max(0, ...vals);
  const m = niceMax(peak);
  const y = (v: number) => 100 - (v / m) * 100;
  const pts = vals.map((v, k) => `${pctAt(k, vals.length)},${y(v)}`).join(" ");
  const dots = peak <= 2;
  const last = vals.length - 1;
  const mi = marker ? data.findIndex((d) => d.day === marker.day) : -1;
  const pk = vals.indexOf(peak);
  const word = (n: number) => (n === 1 ? unit[0] : unit[1]);
  const summary = `${label}: ${sum(vals)} ${unit[1]}-days over ${data.length} days, most ${peak} on ${pk >= 0 ? dayMonth(data[pk]!.day) : "none"}, today ${vals[last] ?? 0}.`;
  return (
    <div className="relative h-48 w-full">
      <div className="absolute top-5 right-2 bottom-6 left-8">
        <svg
          role="img"
          aria-label={summary}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="block h-full w-full overflow-visible"
        >
          {[0, m / 2, m].map((t) => (
            <line key={t} x1="0" x2="100" y1={y(t)} y2={y(t)} vectorEffect="non-scaling-stroke" className="stroke-line" />
          ))}
          {mi >= 0 && (
            <line
              x1={pctAt(mi, vals.length)}
              x2={pctAt(mi, vals.length)}
              y1="-8"
              y2="100"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
              className="stroke-mute"
            />
          )}
          {!dots && (
            <>
              <polygon points={`0,100 ${pts} 100,100`} className="fill-cyan/10" />
              <polyline
                points={pts}
                fill="none"
                strokeWidth="2"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-cyan"
              />
            </>
          )}
          {data.map((d, k) => (
            <rect
              key={d.day}
              x={pctAt(k, vals.length) - 50 / Math.max(1, vals.length - 1)}
              y="0"
              width={100 / Math.max(1, vals.length - 1)}
              height="100"
              fill="transparent"
            >
              <title>{`${dayMonth(d.day)}: ${d.n} ${word(d.n)} active`}</title>
            </rect>
          ))}
        </svg>
        <div aria-hidden="true">
          {[0, m / 2, m].map((t) => (
            <span key={t} className="tabular absolute right-full mr-2 -translate-y-1/2 text-tag text-mute" style={{ top: `${y(t)}%` }}>
              {t}
            </span>
          ))}
          {mi >= 0 && (
            <span
              className="absolute bottom-full ml-1.5 text-tag whitespace-nowrap text-text-2"
              style={{ left: `${pctAt(mi, vals.length)}%` }}
            >
              {marker!.label}
            </span>
          )}
          {dots
            ? vals.map((v, k) =>
                v > 0 ? (
                  <span
                    key={k}
                    className="absolute size-2 -translate-1/2 rounded-full bg-cyan"
                    style={{ left: `${pctAt(k, vals.length)}%`, top: `${y(v)}%` }}
                  />
                ) : null,
              )
            : last >= 0 && (
                <>
                  <span
                    className="absolute size-2.5 -translate-1/2 rounded-full border-2 border-surface bg-cyan"
                    style={{ left: `${pctAt(last, vals.length)}%`, top: `${y(vals[last]!)}%` }}
                  />
                  <span
                    className="absolute -translate-x-full -translate-y-full pr-2 pb-1 text-tag font-bold whitespace-nowrap text-text"
                    style={{ left: `${pctAt(last, vals.length)}%`, top: `${y(vals[last]!)}%` }}
                  >
                    today {vals[last]}
                  </span>
                  {peak > (vals[last] ?? 0) && pk >= 0 && (
                    <span
                      className="absolute -translate-y-full pb-1 pl-1.5 text-tag whitespace-nowrap text-text-2"
                      style={{ left: `${Math.min(pctAt(pk, vals.length), 80)}%`, top: `${y(peak)}%` }}
                    >
                      peak {peak}
                    </span>
                  )}
                </>
              )}
          {data.length > 0 && (
            <div className="tabular absolute inset-x-0 top-full mt-1.5 flex justify-between text-tag text-mute">
              <span>{dayMonth(data[0]!.day)}</span>
              {data.length > 2 && <span>{dayMonth(data[Math.floor(last / 2)]!.day)}</span>}
              <span>{dayMonth(data[last]!.day)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A small bar per day for one kind of action, on its own scale; today's bar is the bright one. */
export function MiniBars({ data, label, unit }: { data: DayCount[]; label: string; unit: string }) {
  const n = data.length;
  const m = Math.max(1, ...data.map((d) => d.n));
  const gap = n > 60 ? 0.15 : 0.25;
  const total = sum(data.map((d) => d.n));
  const peak = data.reduce((a, b) => (b.n > a.n ? b : a), data[0]!);
  return (
    <svg
      role="img"
      aria-label={`${label}: ${total} in ${n} days, most ${peak.n} on ${dayMonth(peak.day)}.`}
      viewBox={`0 0 ${n} 36`}
      preserveAspectRatio="none"
      className="block h-9 w-full"
    >
      {data.map((d, i) => {
        const h = d.n > 0 ? Math.max(3, (d.n / m) * 35) : 2;
        return (
          <rect
            key={d.day}
            x={i + gap / 2}
            y={36 - h}
            width={1 - gap}
            height={h}
            className={d.n > 0 ? (i === n - 1 ? "fill-cyan" : "fill-cyan/55") : "fill-surface-2"}
          >
            <title>{`${dayMonth(d.day)}: ${d.n} ${unit}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** AI spend per day: readers (cyan) under system jobs (grey), against a dashed daily cap. */
export function SpendBars({ data, cap, label }: { data: { day: string; readers: number; builds: number }[]; cap: number; label: string }) {
  const n = data.length;
  const totals = data.map((d) => d.readers + d.builds);
  const m = Math.max(cap * 1.17, ...totals);
  const y = (v: number) => 100 - (v / m) * 100;
  const step = m <= 6 ? 1 : Math.ceil(m / 4);
  const ticks = Array.from({ length: Math.floor(m / step) + 1 }, (_, i) => i * step);
  const gap = n > 60 ? 0.15 : 0.25;
  const over = totals.filter((t) => t > cap).length;
  return (
    <div className="relative h-40 w-full">
      <div className="absolute top-2 right-0 bottom-6 left-9">
        <svg
          role="img"
          aria-label={`${label}: ${usd(sum(totals))} over ${n} days, readers ${usd(sum(data.map((d) => d.readers)))}, ${plural(over, "day")} over the ${usd(cap)} cap.`}
          viewBox={`0 0 ${n} 100`}
          preserveAspectRatio="none"
          className="block h-full w-full overflow-visible"
        >
          {ticks.map((t) => (
            <line key={t} x1="0" x2={n} y1={y(t)} y2={y(t)} vectorEffect="non-scaling-stroke" className="stroke-line" />
          ))}
          {data.map((d, i) => (
            <g key={d.day}>
              {d.readers + d.builds === 0 && <rect x={i + gap / 2} y={98} width={1 - gap} height={2} className="fill-surface-2" />}
              {d.readers > 0 && <rect x={i + gap / 2} y={y(d.readers)} width={1 - gap} height={100 - y(d.readers)} className="fill-cyan" />}
              {d.builds > 0 && (
                <rect
                  x={i + gap / 2}
                  y={y(d.readers + d.builds)}
                  width={1 - gap}
                  height={y(d.readers) - y(d.readers + d.builds)}
                  className="fill-mute-2"
                />
              )}
              <rect x={i} y="0" width="1" height="100" fill="transparent">
                <title>{`${dayMonth(d.day)}: ${usd(d.readers + d.builds)} (readers ${usd(d.readers)}, builds ${usd(d.builds)})`}</title>
              </rect>
            </g>
          ))}
          <line
            x1="0"
            x2={n}
            y1={y(cap)}
            y2={y(cap)}
            strokeWidth="1.5"
            strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke"
            className="stroke-mute"
          />
        </svg>
        <div aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="tabular absolute right-full mr-1.5 -translate-y-1/2 text-tag text-mute" style={{ top: `${y(t)}%` }}>
              ${t}
            </span>
          ))}
          {n > 0 && (
            <div className="tabular absolute inset-x-0 top-full mt-1.5 flex justify-between text-tag text-mute">
              <span>{dayMonth(data[0]!.day)}</span>
              <span>{dayMonth(data[n - 1]!.day)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const CELL_HEAD = ["Week 2", "Week 3", "Week 4"];

/** Fill strength for a cohort cell. Text sits on it, so alphas where neither light nor dark text reaches 4.5:1
 *  on the dark surface (about 0.42 to 0.62) snap to the nearer edge, and the text colour follows the side. */
function cellLook(c: Exclude<CohortCell, { state: "not-yet" }>, size: number) {
  let a = 0.12 + 0.78 * (size > 0 ? c.back / size : 0);
  if (a > 0.42 && a < 0.62) a = a < 0.52 ? 0.42 : 0.62;
  return { bg: `color-mix(in srgb, var(--color-cyan) ${Math.round(a * 100)}%, transparent)`, dark: a >= 0.62 };
}

/** Did each sign-up week come back? A real table: rows are sign-up weeks, columns the weeks after. */
export function CohortGrid({ cohorts, today }: { cohorts: WeekCohort[]; today: string }) {
  return (
    <table className="tabular w-full table-fixed border-separate border-spacing-1 text-small">
      <caption className="sr-only">How many people from each sign-up week were active in each later week</caption>
      <thead>
        <tr className="text-tag text-mute">
          <th scope="col" className="w-1/4 text-left font-normal">
            Joined week of
          </th>
          <th scope="col" className="w-1/6 pr-2 text-right font-normal">
            People
          </th>
          {CELL_HEAD.map((h) => (
            <th key={h} scope="col" className="font-normal">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cohorts.map((c) => (
          <tr key={c.week}>
            <th scope="row" className="text-left font-normal text-text">
              {dayMonth(c.week)}
            </th>
            <td className="pr-2 text-right text-text-2">{c.size}</td>
            {c.back.map((back, j) => {
              const cell = cohortCell(c.week, (j + 1) as 1 | 2 | 3, today, back, c.size);
              if (cell.state === "not-yet")
                return (
                  <td key={j} className="h-10 rounded-md border border-line bg-background text-center text-tag text-mute">
                    not yet
                  </td>
                );
              const look = cellLook(cell, c.size);
              const running = cell.state === "running";
              return (
                <td
                  key={j}
                  title={`Joined week of ${dayMonth(c.week)}: ${back} of ${c.size} came back in ${CELL_HEAD[j]!.toLowerCase()}${running ? " so far (week still running)" : ""}`}
                  className={`h-10 rounded-md text-center leading-tight ${running ? "border border-dashed border-mute" : ""} ${look.dark ? "text-on-cyan" : "text-text"}`}
                  style={{ backgroundColor: look.bg }}
                >
                  <b className="block text-tag font-bold">
                    {back} of {c.size}
                  </b>
                  {(cell.pct !== null || running) && (
                    <span className="block text-tag">
                      {cell.pct !== null ? `${cell.pct}%` : ""}
                      {running ? `${cell.pct !== null ? " " : ""}so far` : ""}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The cohort grid's key. */
export function CohortLegend() {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-tag text-text-2">
      <span className="inline-flex items-center gap-1.5">
        <i aria-hidden="true" className="inline-block size-2.5 rounded-sm bg-cyan" />
        darker = more came back
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i aria-hidden="true" className="inline-block size-2.5 rounded-sm border border-dashed border-mute" />
        week still running
      </span>
      <span className="text-mute">Under {MIN_GROUP_FOR_PCT} people: counts only.</span>
    </div>
  );
}

/** The numbers behind a daily chart, newest first, in a collapsed table: on a phone there is no hover for the
 *  per-bar tooltips, and a screen reader gets every value, not only the chart's one-line summary. */
export function NumbersByDay({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: { day: string; values: (string | number)[] }[];
}) {
  return (
    <details className="text-small">
      <summary className="cursor-pointer text-tag text-text-2">Numbers by day</summary>
      <table className="tabular mt-2 w-full text-tag">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-mute">
            <th scope="col" className="py-1 text-left font-normal">
              Day
            </th>
            {columns.map((c) => (
              <th key={c} scope="col" className="py-1 pl-2 text-right font-normal">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.toReversed().map((r) => (
            <tr key={r.day} className="border-t border-line text-text-2">
              <th scope="row" className="py-1 text-left font-normal">
                {dayMonth(r.day)}
              </th>
              {r.values.map((v, i) => (
                <td key={columns[i]} className="py-1 pl-2 text-right">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
