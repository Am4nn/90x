"use client";

import Link from "next/link";
import { useOptimistic } from "react";
import { markStudiedAction, reviveAction, skipReviewAction } from "@/app/actions/today";
import { button } from "@/components/button-styles";
import { useServerAction } from "@/components/form";
import { useOnline } from "@/components/offline/use-online";
import type { TodayMission } from "@/lib/tracker/service";

const DOT: Record<string, string> = {
  dsa: "bg-topic-dsa",
  system_design: "bg-topic-sd",
  cs: "bg-topic-cs",
  java: "bg-topic-java",
  sql: "bg-topic-sql",
};

function href(m: TodayMission) {
  if (m.slotType === "topic") return `/library/topic/${m.ref}`;
  if (m.slotType === "cards") return "/feed";
  return `/library/problem/${m.ref}`;
}

/** The status square, which is what names a mission's state.
 *
 *  The square says "Done", "Skipped", "Coming soon" or "Open"; `Meta` beside it
 *  is hidden when its text would only repeat that, and announced when it adds
 *  the estimate. One announcement per mission either way.
 *
 *  Worth writing down, because I got this wrong twice. All four labels used to
 *  sit on a bare span, where aria-label is prohibited and ignored, so none were
 *  announced at all. Making them work revealed that `Meta` said the same word,
 *  and the tempting fix - hide the squares - loses the state for an open mission,
 *  whose `Meta` shows "45m" and never says it is still to do. The square is the
 *  right place for the state; the duplicate to remove is the text.
 */
function Box({ status }: { status: TodayMission["status"] }) {
  if (status === "done")
    return (
      <span className="grid size-5 place-items-center rounded-md bg-cyan text-on-cyan" role="img" aria-label="Done">
        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M2.5 6.5 5 9l4.5-6" />
        </svg>
      </span>
    );
  if (status === "skipped")
    return (
      <span className="grid size-5 place-items-center rounded-md border border-line-2 text-mute" role="img" aria-label="Skipped">
        <span aria-hidden="true">–</span>
      </span>
    );
  return (
    <span
      className={`size-5 rounded-md border-[1.5px] ${status === "coming_soon" ? "border-dashed border-line-2" : "border-line-2"}`}
      role="img"
      aria-label={status === "coming_soon" ? "Coming soon" : "Open"}
    />
  );
}

function Meta({ m }: { m: TodayMission }) {
  const text = m.status === "done" ? "Done" : m.status === "skipped" ? "Skipped" : m.status === "coming_soon" ? "Soon" : `${m.estMinutes}m`;
  // Hidden when the square beside it already says this, announced when it is the
  // estimate and so the only place that number appears.
  const echoes = m.status !== "open";
  return (
    <span className="tabular shrink-0 text-small text-mute" aria-hidden={echoes || undefined}>
      {text}
    </span>
  );
}

type Update = { id: string; status: TodayMission["status"] };

export function MissionList({ missions }: { missions: TodayMission[] }) {
  const { run, pending, error } = useServerAction();
  const online = useOnline();
  const [shown, apply] = useOptimistic(missions, (list, u: Update) => list.map((m) => (m.id === u.id ? { ...m, status: u.status } : m)));

  const act = (m: TodayMission, fn: () => Promise<unknown>) =>
    run(async () => {
      apply({ id: m.id, status: m.slotType === "topic" ? "done" : "skipped" });
      return (await fn()) as { error?: string };
    });

  return (
    <div className="flex flex-col gap-2">
      <ul aria-label="Missions" className="flex flex-col rounded-xl border border-line bg-surface">
        {shown.map((m) => {
          const link = href(m);
          const open = m.status === "open";
          return (
            <li key={m.id} className="flex flex-col gap-2.5 border-t border-line px-4 py-3.5 first:border-0">
              <div className={`grid grid-cols-[20px_1fr_auto] items-center gap-3.5 ${m.status === "coming_soon" ? "opacity-60" : ""}`}>
                <Box status={m.status} />
                <div className="min-w-0">
                  {link && m.status !== "coming_soon" ? (
                    <Link
                      href={link}
                      className={`flex items-center gap-2 font-semibold ${open ? "text-text hover:text-cyan" : "text-mute line-through decoration-line-2"}`}
                    >
                      <span className={`size-2 shrink-0 rounded-full ${DOT[m.area] ?? "bg-mute"}`} />
                      <span className="truncate">{m.title}</span>
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2 font-semibold text-text-2">
                      <span className={`size-2 shrink-0 rounded-full ${DOT[m.area] ?? "bg-mute"}`} />
                      {m.title}
                    </span>
                  )}
                  {m.isRevive && <span className="text-small text-mute">Extra: reviving {m.reviveOf}</span>}
                  {m.isExtra && <span className="text-small text-mute">Extra: doesn&apos;t count toward today</span>}
                </div>
                <Meta m={m} />
              </div>
              {open && m.slotType === "review" && (
                <div className="flex gap-2 pl-8.5">
                  <button
                    type="button"
                    disabled={pending || !online}
                    onClick={() => act(m, () => skipReviewAction(m.id, "not_today"))}
                    className={button({ size: "sm" })}
                  >
                    Not today
                  </button>
                  <button
                    type="button"
                    disabled={pending || !online}
                    onClick={() => act(m, () => skipReviewAction(m.id, "got_it"))}
                    className={button({ size: "sm" })}
                  >
                    I&apos;ve got this
                  </button>
                </div>
              )}
              {open && m.slotType === "topic" && (
                <div className="flex gap-2 pl-8.5">
                  <button
                    type="button"
                    disabled={pending || !online}
                    onClick={() => act(m, () => markStudiedAction(m.ref, true))}
                    className={button({ size: "sm" })}
                  >
                    Mark studied
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!online && shown.some((m) => m.status === "open" && (m.slotType === "review" || m.slotType === "topic")) && (
        <p className="text-small text-mute">Skips and Mark studied need a connection. They&apos;re back when you&apos;re online.</p>
      )}
      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

export function ReviveBanner({ dates }: { dates: string[] }) {
  const { run, pending, error } = useServerAction();
  const online = useOnline();
  const date = dates.at(-1);
  if (!date) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warn/40 bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold">You missed {date}.</span>
        <span className="text-small text-mute">Do that day&apos;s missions as extra work today to keep your streak.</span>
        {!online && <span className="text-small text-mute">Reviving needs a connection.</span>}
        {error && (
          <span role="alert" className="text-small text-bad">
            {error}
          </span>
        )}
      </div>
      <button
        type="button"
        disabled={pending || !online}
        aria-busy={pending || undefined}
        onClick={() => run(() => reviveAction(date))}
        className={`${button({ variant: "primary" })} shrink-0`}
      >
        {pending ? "Adding…" : "Revive it"}
      </button>
    </div>
  );
}

export function MarkStudied({ slug, studied }: { slug: string; studied: boolean }) {
  const { run, pending, error } = useServerAction();
  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => run(() => markStudiedAction(slug, !studied))}
        className={button({ variant: studied ? "secondary" : "primary" })}
      >
        {pending ? "Saving…" : studied ? "Studied ✓ · undo" : "Mark studied"}
      </button>
      {error && (
        <span role="alert" className="text-small text-bad">
          {error}
        </span>
      )}
    </div>
  );
}
