import { jobsOverview } from "@/lib/admin/jobs";
import { type JobState, type JobView, STRIP_SIZE } from "@/lib/jobs/view";
import { Section } from "./charts";

// Analytics, scheduled jobs: one row per scheduled job with its status, what the last run returned, the next
// run and the last 14 runs as a strip. A row opens (plain <details>, no client JS) to the last runs and their
// raw results. Range-independent: it always shows the latest runs.

const CHIP: Record<JobState, { className: string; label: string }> = {
  ok: { className: "border-ok/35 bg-ok/10 text-ok", label: "ok" },
  failed: { className: "border-bad/35 bg-bad/10 text-bad", label: "failed" },
  skipped: { className: "border-line-2 bg-surface-2 text-text-2", label: "skipped" },
  running: { className: "border-cyan/35 bg-cyan/10 text-cyan", label: "running" },
  late: { className: "border-warn/35 bg-warn/10 text-warn", label: "late" },
  never: { className: "border-dashed border-line-2 text-mute", label: "never ran" },
};

function Chip({ state }: { state: JobState }) {
  const chip = CHIP[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 justify-self-start rounded-full border px-2.5 py-0.5 text-tag leading-chip font-semibold whitespace-nowrap ${chip.className}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${state === "never" ? "border border-current" : "bg-current"}`} />
      {chip.label}
    </span>
  );
}

// One look per strip cell. A failure stands taller than the rest, so it reads without colour too.
const CELL: Record<JobView["strip"][number], { className: string; label: string }> = {
  ok: { className: "h-4 bg-ok/85", label: "ok" },
  failed: { className: "h-5 bg-bad", label: "failed" },
  skipped: { className: "h-4 border border-mute", label: "skipped, nothing to do" },
  running: { className: "h-4 border border-cyan", label: "running" },
  none: { className: "h-4 border border-dashed border-line-2", label: "no record" },
};

function Strip({ strip }: { strip: JobView["strip"] }) {
  const count = (s: keyof typeof CELL) => strip.filter((c) => c === s).length;
  const recorded = STRIP_SIZE - count("none");
  const label = recorded
    ? `Last ${recorded} ${recorded === 1 ? "run" : "runs"}, oldest first: ${count("ok")} ok, ${count("failed")} failed, ${count("skipped")} skipped`
    : "No runs recorded";
  return (
    <span role="img" aria-label={label} className="flex h-5 items-center gap-1 justify-self-end @min-[820px]:justify-self-start">
      {strip.map((c, i) => (
        <span key={i} title={CELL[c].label} className={`w-2 shrink-0 rounded-xs ${CELL[c].className}`} />
      ))}
    </span>
  );
}

const COLUMNS =
  "grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 @min-[820px]:grid-cols-[minmax(160px,1.3fr)_96px_minmax(170px,1.4fr)_120px_164px_12px] @min-[820px]:gap-x-3.5";

function RowLine({ v }: { v: JobView }) {
  return (
    <>
      <span className="flex flex-col text-body leading-head font-semibold text-text">
        {v.name}
        <span className="text-tag leading-label font-medium text-mute">{v.where}</span>
      </span>
      <span className="justify-self-end @min-[820px]:justify-self-start">
        <Chip state={v.state} />
      </span>
      <span className="col-span-2 flex flex-col text-small text-text-2 @min-[820px]:col-span-1">
        {v.summary}
        <span className="tabular text-tag leading-label text-mute">{v.last}</span>
      </span>
      <span className="tabular flex flex-col text-small text-text-2 @min-[820px]:whitespace-nowrap">
        <span>
          <span className="text-mute @min-[820px]:hidden">Next: </span>
          {v.next.label}
        </span>
        <span className="hidden text-tag leading-label text-mute @min-[820px]:block">{v.next.detail}</span>
      </span>
      <Strip strip={v.strip} />
    </>
  );
}

function JobRow({ v }: { v: JobView }) {
  if (!v.runs.length) {
    return (
      <div className={`grid ${COLUMNS} border-t border-line py-3 first:border-t-0`}>
        <RowLine v={v} />
      </div>
    );
  }
  return (
    <details className="group border-t border-line first:border-t-0">
      <summary className={`grid ${COLUMNS} cursor-pointer list-none py-3 [&::-webkit-details-marker]:hidden`}>
        <RowLine v={v} />
        <span aria-hidden="true" className="hidden text-tag text-mute transition-transform group-open:rotate-90 @min-[820px]:block">
          ▶
        </span>
      </summary>
      <ol aria-label={`Last runs of ${v.name}`} className="mb-3.5 flex flex-col rounded-lg border border-line bg-background px-3 py-1">
        {v.runs.map((r) => (
          <li
            key={r.id}
            className="grid grid-cols-[1fr_auto_auto] items-start gap-x-2.5 gap-y-1 border-t border-line py-2.5 text-small text-text-2 first:border-t-0 @min-[820px]:grid-cols-[150px_92px_70px_1fr] @min-[820px]:gap-x-3"
          >
            <span className="tabular">{r.when}</span>
            <Chip state={r.state} />
            <span className="tabular">{r.duration}</span>
            <span className={`col-span-full @min-[820px]:col-span-1 ${r.error ? "text-bad" : "hidden @min-[820px]:block"}`}>{r.error}</span>
            <pre className="col-span-full rounded-lg border border-line bg-surface px-2.5 py-2 font-mono text-tag leading-code break-words whitespace-pre-wrap text-text-2">
              {r.raw}
            </pre>
          </li>
        ))}
      </ol>
    </details>
  );
}

function Legend() {
  return (
    <p aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-1 text-tag leading-label text-mute">
      {(["ok", "failed", "skipped", "none"] as const).map((c) => (
        <span key={c} className="inline-flex items-center gap-1.5">
          <span className={`w-2 rounded-xs ${CELL[c].className}`} />
          {CELL[c].label}
        </span>
      ))}
    </p>
  );
}

export async function JobsSection() {
  const { rows, caption } = await jobsOverview();
  return (
    <div id="jobs" className="scroll-mt-4">
      <Section n={9} title="Scheduled jobs" hint="times in IST · tap a row for its last runs">
        <div className="@container flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <div aria-hidden="true" className={`${COLUMNS} hidden border-b border-line pb-1.5 text-tag text-mute @min-[820px]:grid`}>
            <span>Job</span>
            <span>Status</span>
            <span>Last run: what it returned</span>
            <span>Next run</span>
            <span>Last {STRIP_SIZE} runs (oldest left)</span>
          </div>
          <div className="flex flex-col">
            {rows.map((v) => (
              <JobRow key={v.id} v={v} />
            ))}
          </div>
          <Legend />
          <p className="text-small text-text-2">
            <span className="text-mute">In plain words: </span>
            {caption}
          </p>
        </div>
      </Section>
    </div>
  );
}
