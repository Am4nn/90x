"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setMinutes, syncNow } from "@/app/actions/sync";
import { button, chip } from "@/components/button-styles";
import { Busy, useServerAction } from "@/components/form";
import { relative } from "@/lib/format/time";

// The LeetCode block on Me, always open: a status line, the
// Easy/Medium/Hard totals, the "how long did these take?" time chips for synced
// solves that still need a time, and a full-width Sync button. Client because
// sync and the time forms are actions the user runs.

const CHIPS = [15, 30, 45, 60];
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

const SYNC_MESSAGES = {
  disabled: "Add your LeetCode username in setup to sync.",
  skipped: "Sync is paused after repeated failures; it retries once a day.",
  unknown_user: "LeetCode has no user with your username. Check it in setup.",
} as const;

type Totals = { accepted: Record<string, number>; failed: Record<string, number> };
type Status = { lastSuccessAt: string | null; unavailable: boolean; totals: Totals | null };
type PendingCheckin = { id: string; title: string; result: string; attempts: number | null; suggested: number | null };

function statusLine(status: Status | null): string {
  if (!status) return "Not synced yet";
  if (status.unavailable) return "Sync unavailable";
  if (status.lastSuccessAt) return `Synced ${relative(status.lastSuccessAt)}`;
  return "Not synced yet";
}

/** One synced solve's time chips. The tapped chip lights on the tap; the save and the refresh follow. */
function TimeRow({ c }: { c: PendingCheckin }) {
  const { run, pending, error } = useServerAction();
  const [chosen, choose] = useOptimistic<number | null, number>(null, (_, minutes) => minutes);
  const save = (minutes: number) => {
    const form = new FormData();
    form.set("checkinId", c.id);
    form.set("minutes", String(minutes));
    run(() => setMinutes(form), { optimistic: () => choose(minutes) });
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-small text-text-2">
        {c.title} ·{" "}
        {c.result === "solved" ? (c.attempts && c.attempts > 1 ? `solved after ${c.attempts} tries` : "solved first try") : "not solved"}
      </span>
      <div className="flex gap-2">
        {CHIPS.map((m) => {
          const lit = chosen === null ? Boolean(c.suggested && Math.abs(c.suggested - m) <= 7) : chosen === m;
          return (
            <button
              key={m}
              type="button"
              disabled={pending}
              aria-pressed={chosen === m || undefined}
              onClick={() => save(m)}
              className={`${chip(lit)} flex-1`}
            >
              <Busy busy={pending && chosen === m}>{m === 60 ? "60m+" : `${m}m`}</Busy>
            </button>
          );
        })}
      </div>
      {error && (
        <span role="alert" className="text-small text-bad">
          {error}
        </span>
      )}
    </div>
  );
}

export function LeetCodeCard({ status, pendingTime }: { status: Status | null; pendingTime: PendingCheckin[] }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const t = status?.totals ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-heading font-semibold">LeetCode</h2>
        {/* `relative()` reads the clock, so the server's "3m ago" can differ from
            the client's at a minute boundary; the mismatch is text-only and harmless. */}
        <span suppressHydrationWarning className="text-small text-mute">
          {statusLine(status)}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {t && (
          <div className="grid grid-cols-3 divide-x divide-line">
            {DIFFICULTIES.map((d) => (
              <div key={d} className="flex flex-col gap-1 p-4">
                <span className="text-small text-mute capitalize">{d}</span>
                <span className="tabular font-display text-title font-bold text-text">{t.accepted[d] ?? 0}</span>
                <span className="text-small text-mute">{t.failed[d] ?? 0} attempted</span>
              </div>
            ))}
          </div>
        )}

        {pendingTime.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-line px-4 py-3.5">
            <span className="text-small text-mute">How long did these take?</span>
            {pendingTime.map((c) => (
              <TimeRow key={c.id} c={c} />
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() =>
          start(async () => {
            const r = await syncNow().catch(() => null);
            if (!r) return setMessage("Couldn't reach 90x. Check your connection and try again.");
            if (r.status === "ok") setMessage(r.created.length ? `${r.created.length} new from LeetCode` : "Up to date");
            else if (r.status === "failed") setMessage("LeetCode didn't respond. Your manual check-ins still work.");
            else setMessage(SYNC_MESSAGES[r.status]);
          })
        }
        className={`${button({ size: "lg" })} w-full`}
      >
        <Busy busy={pending}>{pending ? "Syncing…" : "Sync now"}</Busy>
      </button>
      {message && (
        <span className="text-small text-mute" role="status">
          {message}
        </span>
      )}
    </div>
  );
}
