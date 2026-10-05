"use client";

import Link from "next/link";
import { useOptimistic } from "react";
import { markStudiedAction, moreCardsAction, moreProblemAction, reviveAction, skipReviewAction } from "@/app/actions/today";
import { button } from "@/components/button-styles";
import { type FormState, useServerAction } from "@/components/form";
import { useOnline } from "@/components/offline/use-online";
import { XpGain } from "@/components/xp-gain";
import type { TodayMission } from "@/lib/tracker/service";

// Topic area -> the tag label and its colour. `area` is "dsa" for problems,
// "cs" for cards and the topic's domain otherwise (service.ts), so these five
// are the whole set; the pill borrows its colour from the same tokens.
const AREA: Record<string, { label: string; tag: string }> = {
  dsa: { label: "DSA", tag: "text-topic-dsa" },
  system_design: { label: "Design", tag: "text-topic-sd" },
  cs: { label: "CS", tag: "text-topic-cs" },
  java: { label: "Java", tag: "text-topic-java" },
  sql: { label: "SQL", tag: "text-topic-sql" },
};

function href(m: TodayMission) {
  if (m.slotType === "topic") return `/library/topic/${m.ref}`;
  if (m.slotType === "cards") return "/feed";
  return `/library/problem/${m.ref}`;
}

/** The status square, which is what names a mission's state. Its aria-label
 *  ("Done", "Skipped", "Coming soon", "Open") is the one announcement per
 *  mission, so the title never repeats the word. */
function Box({ status }: { status: TodayMission["status"] }) {
  if (status === "done")
    return (
      <span
        className="grid size-5 shrink-0 place-items-center rounded-sm border-[1.5px] border-cyan bg-cyan-bg text-cyan"
        role="img"
        aria-label="Done"
      >
        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M2.5 6.5 5 9l4.5-6" />
        </svg>
      </span>
    );
  if (status === "skipped")
    return (
      <span
        className="grid size-5 shrink-0 place-items-center rounded-sm border-[1.5px] border-line-2 text-mute"
        role="img"
        aria-label="Skipped"
      >
        <span aria-hidden="true">–</span>
      </span>
    );
  return (
    <span
      className={`size-5 shrink-0 rounded-sm border-[1.5px] ${status === "coming_soon" ? "border-dashed border-line-2" : "border-line-2"}`}
      role="img"
      aria-label={status === "coming_soon" ? "Coming soon" : "Open"}
    />
  );
}

/** The topic chip on the right: "DSA", "Design", "CS", "Java" or "SQL" in its
 *  area colour. */
function TopicTag({ area }: { area: string }) {
  const meta = AREA[area];
  return <span className={`tag shrink-0 ${meta?.tag ?? ""}`}>{meta?.label ?? area}</span>;
}

type Update = { id: string; status: TodayMission["status"] };

export function MissionList({ missions }: { missions: TodayMission[] }) {
  const { run, pending, error, gain } = useServerAction();
  const online = useOnline();
  const [shown, apply] = useOptimistic(missions, (list, u: Update) => list.map((m) => (m.id === u.id ? { ...m, status: u.status } : m)));

  const act = (m: TodayMission, fn: () => Promise<FormState>) =>
    run(async () => {
      apply({ id: m.id, status: m.slotType === "topic" ? "done" : "skipped" });
      return fn();
    });

  return (
    <div className="flex flex-col gap-2">
      <ul aria-label="Missions" className="flex flex-col rounded-xl border border-line bg-surface">
        {shown.map((m) => {
          const link = href(m);
          const open = m.status === "open";
          return (
            <li key={m.id} className="border-t border-line px-4 py-3.5 first:border-0">
              <div className={`flex items-start gap-3 ${m.status === "coming_soon" ? "opacity-60" : ""}`}>
                <Box status={m.status} />
                <div className="min-w-0 flex-1">
                  {link && m.status !== "coming_soon" ? (
                    <Link
                      href={link}
                      className={`block truncate font-semibold ${
                        m.status === "skipped" ? "text-mute line-through decoration-2" : open ? "text-text hover:text-cyan" : "text-text"
                      }`}
                    >
                      {m.title}
                    </Link>
                  ) : (
                    <span className="block truncate font-semibold text-text-2">{m.title}</span>
                  )}
                  <div className="text-small text-mute">{m.reason}</div>
                  {m.isRevive && <div className="text-small text-mute">Extra: reviving {m.reviveOf}</div>}
                  {m.isExtra && <div className="text-small text-mute">Extra: doesn&apos;t count toward today</div>}
                </div>
                <TopicTag area={m.area} />
              </div>
              {open && m.slotType === "review" && (
                <div className="mt-2.5 flex gap-2 pl-8">
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
                <div className="mt-2.5 flex gap-2 pl-8">
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
      <XpGain xp={gain?.xp} bonus={gain?.bonus} />
    </div>
  );
}

/** Once the day is done: a quiet offer of bonus work. Each button adds an extra mission, which never changes the day. */
export function WantMore() {
  const { run, pending, error } = useServerAction();
  const online = useOnline();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-small text-mute">Want more?</span>
        <button
          type="button"
          disabled={pending || !online}
          onClick={() => run(() => moreProblemAction())}
          className={button({ size: "sm" })}
        >
          One more problem
        </button>
        <button type="button" disabled={pending || !online} onClick={() => run(() => moreCardsAction())} className={button({ size: "sm" })}>
          10 more cards
        </button>
      </div>
      {!online && <p className="text-small text-mute">Adding more needs a connection.</p>}
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
  const { run, pending, error, gain } = useServerAction();
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
      <XpGain xp={gain?.xp} bonus={gain?.bonus} />
    </div>
  );
}
