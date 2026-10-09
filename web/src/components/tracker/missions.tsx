"use client";

import Link from "next/link";
import { useOptimistic, useState } from "react";
import { addExtraAction, markStudiedAction, removeExtraAction, reviveAction, skipReviewAction } from "@/app/actions/today";
import { button } from "@/components/button-styles";
import { AddCoachLink, AddCoachPanel, type AddCoachProps } from "@/components/coach/add-with-coach";
import { DismissButton, remember, useRemembered } from "@/components/dismiss";
import { Busy, type FormState, useServerAction } from "@/components/form";
import { useOnline } from "@/components/offline/use-online";
import { XpGain } from "@/components/xp-gain";
import { shortDate } from "@/lib/tracker/dates";
import type { TodayExtra, TodayMission } from "@/lib/tracker/service";

// Topic area -> the tag label and its colour. `area` is "dsa" for problems,
// "feed" for cards (the Feed runs every area, so its pill stays neutral) and
// the topic's domain otherwise (service.ts); the pill borrows its colour from
// the same tokens.
const AREA: Record<string, { label: string; tag: string }> = {
  dsa: { label: "DSA", tag: "text-topic-dsa" },
  system_design: { label: "Design", tag: "text-topic-sd" },
  cs: { label: "CS", tag: "text-topic-cs" },
  java: { label: "Java", tag: "text-topic-java" },
  sql: { label: "SQL", tag: "text-topic-sql" },
  feed: { label: "Feed", tag: "text-text-2" },
};

function href(m: { slotType: string; ref: string }) {
  if (m.slotType === "topic") return `/library/topic/${m.ref}`;
  if (m.slotType === "cards") return "/feed";
  // Tells the problem page it came from Today, so its back link does not name the pattern.
  return `/library/problem/${m.ref}?from=today`;
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
  const { run, isBusy, error, gain } = useServerAction();
  const online = useOnline();
  const [shown, apply] = useOptimistic(missions, (list, u: Update) => list.map((m) => (m.id === u.id ? { ...m, status: u.status } : m)));

  const act = (m: TodayMission, fn: () => Promise<FormState>) =>
    run(fn, { id: m.id, optimistic: () => apply({ id: m.id, status: m.slotType === "topic" ? "done" : "skipped" }) });

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
                </div>
                <TopicTag area={m.area} />
              </div>
              {open && m.slotType === "review" && (
                <div className="mt-2.5 flex gap-2 pl-8">
                  <button
                    type="button"
                    disabled={isBusy(m.id) || !online}
                    aria-busy={isBusy(m.id) || undefined}
                    onClick={() => act(m, () => skipReviewAction(m.id, "not_today"))}
                    className={button({ size: "sm" })}
                  >
                    <Busy busy={isBusy(m.id)}>Not today</Busy>
                  </button>
                  <button
                    type="button"
                    disabled={isBusy(m.id) || !online}
                    aria-busy={isBusy(m.id) || undefined}
                    onClick={() => act(m, () => skipReviewAction(m.id, "got_it"))}
                    className={button({ size: "sm" })}
                  >
                    <Busy busy={isBusy(m.id)}>I&apos;ve got this</Busy>
                  </button>
                </div>
              )}
              {open && m.slotType === "topic" && (
                <div className="mt-2.5 flex gap-2 pl-8">
                  <button
                    type="button"
                    disabled={isBusy(m.id) || !online}
                    aria-busy={isBusy(m.id) || undefined}
                    onClick={() => act(m, () => markStudiedAction(m.ref, true))}
                    className={button({ size: "sm" })}
                  >
                    <Busy busy={isBusy(m.id)}>Mark studied</Busy>
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

/** Rows shown before the rest fold behind "Show all". */
const FOLDED_ROWS = 3;

/**
 * The Extras: problems added with "+ Add a problem" or by Coach, carried day to day until solved or
 * removed. They never count toward the day. With none, only the quiet add line shows; the first
 * three rows show and the rest fold, so the page never grows without bound.
 */
export function ExtrasSection({ extras, coach }: { extras: TodayExtra[]; coach?: AddCoachProps }) {
  const { run, isBusy, error } = useServerAction();
  const online = useOnline();
  const [shown, drop] = useOptimistic(extras, (list, id: string) => list.filter((x) => x.id !== id));
  // A placeholder row stands in for the new extra until the page refreshes with the real one.
  const [adding, addPlaceholder] = useOptimistic(false, (_: boolean, next: boolean) => next);
  const [expanded, setExpanded] = useState(false);
  // Add with Coach: the panel folds with × (the day's thread is kept) and after a confirm, which says what landed.
  const [coachOpen, setCoachOpen] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const openCount = shown.filter((x) => x.status === "open").length + (adding ? 1 : 0);
  const rows = expanded ? shown : shown.slice(0, FOLDED_ROWS);
  const hasList = shown.length > 0 || adding;
  const hidden = shown.length - FOLDED_ROWS;
  return (
    // Without a list the add line belongs to the Missions above it, so it closes the section's gap.
    <section className={`flex flex-col gap-3 ${hasList ? "" : "-mt-3"}`}>
      {hasList && (
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-heading font-semibold">Extras</h2>
          <span className="text-small text-mute">{openCount} open</span>
        </div>
      )}
      {hasList && (
        <ul aria-label="Extras" className="flex flex-col rounded-xl border border-line bg-surface">
          {adding && (
            <li aria-hidden="true" className="flex animate-pulse items-center gap-3 px-4 py-3.5 motion-reduce:animate-none">
              <span className="size-5 shrink-0 rounded-sm bg-surface-2" />
              <span className="flex flex-1 flex-col gap-2">
                <span className="h-3.5 w-2/3 rounded-sm bg-surface-2" />
                <span className="h-2.5 w-1/3 rounded-sm bg-surface-2" />
              </span>
            </li>
          )}
          {rows.map((x) => (
            <li key={x.id} className="flex items-start gap-3 border-t border-line px-4 py-3.5 first:border-0">
              <Box status={x.status} />
              <div className="min-w-0 flex-1">
                <Link
                  href={href(x)}
                  className={`block truncate font-semibold ${x.status === "open" ? "text-text hover:text-cyan" : "text-text"}`}
                >
                  {x.title}
                </Link>
                <div className="text-small text-mute">{x.reason}</div>
              </div>
              <TopicTag area={x.area} />
              {x.status === "open" && (
                <button
                  type="button"
                  aria-label={`Remove ${x.title}`}
                  disabled={isBusy(x.id) || !online}
                  onClick={() => run(() => removeExtraAction(x.id), { id: x.id, optimistic: () => drop(x.id) })}
                  // 44px to hit, 28px to look at: the button is transparent and the inner box is what shows;
                  // the negative margins give the extra room back to the row.
                  className="group -mx-2.5 -my-3 grid size-11 shrink-0 place-items-center text-mute disabled:opacity-50"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-7 place-items-center rounded-lg text-heading leading-none transition-colors group-hover:bg-surface-2 group-hover:text-text group-focus-visible:bg-surface-2 group-focus-visible:text-text"
                  >
                    ×
                  </span>
                </button>
              )}
            </li>
          ))}
          {hidden > 0 && (
            <li className="border-t border-line">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
                className="min-h-11 w-full rounded-b-xl px-4 text-left text-small font-semibold text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
              >
                {expanded ? "Show fewer" : `Show all ${shown.length}`}
              </button>
            </li>
          )}
        </ul>
      )}
      {coach && coachOpen && (
        <AddCoachPanel
          coach={coach}
          onClose={() => setCoachOpen(false)}
          onAdded={(note) => {
            setAdded(note);
            setCoachOpen(false);
          }}
        />
      )}
      {!(coach && coachOpen) && (
        <div className="flex flex-wrap items-center gap-x-5">
          <button
            type="button"
            disabled={isBusy("add") || !online}
            aria-busy={isBusy("add") || undefined}
            onClick={() => run(() => addExtraAction(), { id: "add", optimistic: () => addPlaceholder(true) })}
            className="inline-flex min-h-11 items-center gap-1.5 text-small font-semibold text-mute transition-colors hover:text-cyan focus-visible:text-cyan disabled:opacity-50"
          >
            <span aria-hidden="true" className="text-heading leading-none">
              +
            </span>
            <Busy busy={isBusy("add")}>Add a problem</Busy>
          </button>
          {coach && (
            <AddCoachLink
              onOpen={() => {
                setAdded(null);
                setCoachOpen(true);
              }}
            />
          )}
        </div>
      )}
      {added && (
        <p role="status" className="text-small text-cyan">
          {added}
        </p>
      )}
      {!online && <p className="text-small text-mute">Adding more needs a connection.</p>}
      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
    </section>
  );
}

const REVIVE_CLOSED_KEY = "90x:revive-closed";

/** The offer to revive a missed day. × hides it on this device until another day is missed. */
export function ReviveBanner({ dates }: { dates: string[] }) {
  const { run, pending, error } = useServerAction();
  const online = useOnline();
  const date = dates.at(-1);
  const closed = useRemembered(REVIVE_CLOSED_KEY, date);
  // The click hides it at once: the stored value is only re-read on the next render.
  const [closedNow, setClosedNow] = useState(false);
  if (!date || closed || closedNow) return null;
  const close = () => {
    remember(REVIVE_CLOSED_KEY, date);
    setClosedNow(true);
  };
  return (
    <div className="flex items-start gap-2 rounded-xl border border-warn/40 bg-surface p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">You missed {shortDate(date)}.</span>
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
          className={`${button({ variant: "primary" })} shrink-0 self-start sm:self-auto`}
        >
          <Busy busy={pending}>{pending ? "Adding…" : "Revive it"}</Busy>
        </button>
      </div>
      <DismissButton label="Hide" onClick={close} />
    </div>
  );
}

export function MarkStudied({ slug, studied }: { slug: string; studied: boolean }) {
  const { run, pending, error, gain } = useServerAction();
  // The button flips on the tap; the server and the refreshed page confirm it.
  const [shownStudied, setStudied] = useOptimistic(studied, (_: boolean, next: boolean) => next);
  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => run(() => markStudiedAction(slug, !shownStudied), { optimistic: () => setStudied(!shownStudied) })}
        className={button({ variant: shownStudied ? "secondary" : "primary" })}
      >
        <Busy busy={pending}>{shownStudied ? "Studied ✓ · undo" : "Mark studied"}</Busy>
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
