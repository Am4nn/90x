"use client";

import { useState } from "react";
import { overallReportAction } from "@/app/actions/feed";
import { useServerAction } from "@/components/form";
import { comparisonLine, MIN_AREA_ANSWERS, type OverallReport, PASS_MARK, percent, visibleAreas, weekday } from "@/lib/feed/report";
import { AREA_DOT, AREA_FILL, AREA_LABEL, accuracyPercent, type CardView, type SessionStats, whyLine } from "@/lib/feed/view";

const BLOCK = "flex flex-col rounded-xl border border-line bg-surface px-5 py-4 font-medium";
const EYEBROW = "text-tag font-bold tracking-eyebrow text-mute uppercase";

/** Why the Feed chose this card. */
export function WhyBlock({ card }: { card: CardView }) {
  return (
    <section className={`${BLOCK} gap-2`} aria-label="Why this card">
      <h2 className={EYEBROW}>Why this card</h2>
      <p className="text-body text-text">{whyLine(card)}</p>
    </section>
  );
}

function Figure({ label, value, tone = "text-text" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col-reverse gap-1">
      <dt className="text-small text-mute">{label}</dt>
      <dd className={`tabular font-display text-title font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}

const shown = (value: number | null) => (value === null ? "—" : `${value}%`);

/** Today's three numbers, and an Overall report that opens above its own toggle. */
export function TodayBlock({ session }: { session: SessionStats }) {
  const accuracy = accuracyPercent(session);
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<OverallReport | null>(null);
  const { run, pending, error } = useServerAction({ refresh: false });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Fetched when first opened, and again each time so it never shows yesterday's numbers.
    if (next) {
      run(async () => {
        const result = await overallReportAction();
        if ("error" in result) return { error: result.error };
        setReport(result.report);
      });
    }
  };

  return (
    <section className={`${BLOCK} gap-3.5`} aria-label="Today">
      <h2 className={EYEBROW}>Today</h2>
      <dl className="grid grid-cols-3 gap-3">
        <Figure label="Answered" value={String(session.answered)} />
        <Figure label="Correct" value={shown(accuracy)} />
        <Figure label="Skipped" value={String(session.skipped)} />
      </dl>

      {open && (
        <div className="flex flex-col gap-7 border-t border-line pt-5">
          {report ? <Report report={report} /> : <p className="text-small text-mute">{pending ? "Loading…" : (error ?? "")}</p>}
          {report && error && (
            <p role="alert" className="text-small text-bad">
              {error}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-full border border-line-2 px-3.5 text-small font-bold text-text hover:border-mute"
      >
        {open ? "Hide report" : "Overall report"}
        <svg
          viewBox="0 0 24 24"
          className={`size-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </section>
  );
}

function Report({ report }: { report: OverallReport }) {
  const areas = visibleAreas(report.areas);
  return (
    <>
      <div className="flex flex-col gap-3.5">
        <h3 className={EYEBROW}>Lifetime</h3>
        <dl className="grid grid-cols-3 gap-3">
          <Figure label="Answered" value={String(report.lifetime.answered)} />
          <Figure label="Correct" value={shown(percent(report.lifetime))} />
          <Figure label="Skipped" value={String(report.lifetime.skipped)} />
        </dl>
        <p className="text-small text-text-2">{comparisonLine(report.today, report.lifetime)}</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className={EYEBROW}>By area</h3>
          <span className="text-tag text-mute">Pass mark {PASS_MARK}%</span>
        </div>
        {areas.length === 0 ? (
          <p className="text-small text-mute">Answer {MIN_AREA_ANSWERS} cards in an area to see its rate.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {areas.map((row) => {
              const rate = percent(row) ?? 0;
              return (
                <li key={row.area} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-body text-text">
                      <span aria-hidden className={`size-2 rounded-full ${AREA_DOT[row.area]}`} />
                      {AREA_LABEL[row.area]}
                    </span>
                    <span className="tabular font-display text-small font-semibold text-text">{rate}%</span>
                  </div>
                  <svg
                    viewBox="0 0 100 4"
                    preserveAspectRatio="none"
                    className="h-1 w-full"
                    role="img"
                    aria-label={`${AREA_LABEL[row.area]} ${rate}%`}
                  >
                    <rect width="100" height="4" rx="2" className="fill-line" />
                    <rect width={rate} height="4" rx="2" className={AREA_FILL[row.area]} />
                    <rect x={PASS_MARK} width="0.8" height="4" className="fill-mute" />
                  </svg>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className={EYEBROW}>Last 7 days, correct</h3>
        <ul className="grid h-14 grid-cols-7 items-end gap-1.5" aria-hidden>
          {report.days.map((day, index) => {
            const rate = percent(day);
            const isToday = index === report.days.length - 1;
            const height = rate === null ? 0 : Math.max(2, Math.round((rate / 100) * 56));
            return (
              <li key={day.day} className="flex h-full flex-col justify-end">
                <svg viewBox="0 0 10 56" preserveAspectRatio="none" className="h-14 w-full" aria-hidden>
                  <rect y={56 - height} width="10" height={height} rx="1.5" className={isToday ? "fill-cyan" : "fill-text-2"} />
                </svg>
              </li>
            );
          })}
        </ul>
        <ul className="grid grid-cols-7 gap-1.5">
          {report.days.map((day, index) => {
            const rate = percent(day);
            const isToday = index === report.days.length - 1;
            return (
              <li
                key={day.day}
                className="flex flex-col items-center gap-0.5"
                title={day.answered ? `${day.answered} answered` : "No answers yet"}
              >
                <span className="tabular font-display text-tag font-semibold text-text">{shown(rate)}</span>
                <span className="text-tag text-mute">{isToday ? "Today" : weekday(day.day)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
