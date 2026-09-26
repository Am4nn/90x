"use client";

import Link from "next/link";
import { useOptimistic } from "react";
import { markStudiedAction, reviveAction, skipReviewAction } from "@/app/actions/today";
import { useServerAction } from "@/components/form";
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
  if (m.slotType === "cards") return null;
  return `/library/problem/${m.ref}`;
}

function Box({ status }: { status: TodayMission["status"] }) {
  if (status === "done")
    return (
      <span className="grid size-5 place-items-center rounded-md bg-cyan text-on-cyan" aria-label="Done">
        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6.5 5 9l4.5-6" />
        </svg>
      </span>
    );
  if (status === "skipped")
    return (
      <span className="grid size-5 place-items-center rounded-md border border-line-2 text-mute" aria-label="Skipped">
        –
      </span>
    );
  return (
    <span
      className={`size-5 rounded-md border-[1.5px] ${status === "coming_soon" ? "border-dashed border-line-2" : "border-line-2"}`}
      aria-label={status === "coming_soon" ? "Coming soon" : "Open"}
    />
  );
}

function Meta({ m }: { m: TodayMission }) {
  const text = m.status === "done" ? "Done" : m.status === "skipped" ? "Skipped" : m.status === "coming_soon" ? "Soon" : `${m.estMinutes}m`;
  return <span className="tabular shrink-0 text-small text-mute">{text}</span>;
}

type Update = { id: string; status: TodayMission["status"] };

export function MissionList({ missions }: { missions: TodayMission[] }) {
  const { run, pending, error } = useServerAction();
  const [shown, apply] = useOptimistic(missions, (list, u: Update) => list.map((m) => (m.id === u.id ? { ...m, status: u.status } : m)));

  const act = (m: TodayMission, fn: () => Promise<unknown>) =>
    run(async () => {
      apply({ id: m.id, status: m.slotType === "topic" ? "done" : "skipped" });
      return (await fn()) as { error?: string };
    });

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col rounded-xl border border-line bg-surface">
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
                </div>
                <Meta m={m} />
              </div>
              {open && m.slotType === "review" && (
                <div className="flex gap-2 pl-[34px]">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(m, () => skipReviewAction(m.id, "not_today"))}
                    className="h-8 rounded-lg border border-line-2 px-3 text-small font-semibold text-text-2 hover:text-text disabled:opacity-50"
                  >
                    Not today
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(m, () => skipReviewAction(m.id, "got_it"))}
                    className="h-8 rounded-lg border border-line-2 px-3 text-small font-semibold text-text-2 hover:text-text disabled:opacity-50"
                  >
                    I&apos;ve got this
                  </button>
                </div>
              )}
              {open && m.slotType === "topic" && (
                <div className="flex gap-2 pl-[34px]">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(m, () => markStudiedAction(m.ref, true))}
                    className="h-8 rounded-lg border border-line-2 px-3 text-small font-semibold text-text-2 hover:text-text disabled:opacity-50"
                  >
                    Mark studied
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
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
  const date = dates.at(-1);
  if (!date) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warn/40 bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold">You missed {date}.</span>
        <span className="text-small text-mute">Do that day&apos;s missions as extra work today to keep your streak.</span>
        {error && (
          <span role="alert" className="text-small text-bad">
            {error}
          </span>
        )}
      </div>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => run(() => reviveAction(date))}
        className="h-10 shrink-0 rounded-xl bg-cyan px-4 text-small font-semibold text-on-cyan disabled:opacity-60"
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
        className={`h-10 rounded-xl px-4 text-small font-semibold disabled:opacity-60 ${studied ? "border border-line-2 text-text-2" : "bg-cyan text-on-cyan"}`}
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
