"use client";

import { useState } from "react";
import { setMinutes } from "@/app/actions/sync";
import { chip } from "@/components/button-styles";
import { SyncButton } from "@/components/leetcode/sync-button";

// The collapsible LeetCode block on Me. Collapsed it is one status row; expanded
// it is the same totals grid, Sync button and pending-time forms Me used to render
// inline. Client only because it holds the open state.

const CHIPS = [15, 30, 45, 60];
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

type Totals = { accepted: Record<string, number>; failed: Record<string, number> };
type Status = { lastSuccessAt: string | null; unavailable: boolean; totals: Totals | null };
type PendingCheckin = { id: string; title: string; result: string; attempts: number | null; suggested: number | null };

function relative(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusLine(status: Status | null): string {
  if (!status) return "Not synced yet";
  if (status.unavailable) return "Sync unavailable";
  if (status.lastSuccessAt) return `Synced ${relative(status.lastSuccessAt)}`;
  return "Not synced yet";
}

export function LeetCodeCard({ status, pendingTime }: { status: Status | null; pendingTime: PendingCheckin[] }) {
  const [open, setOpen] = useState(false);
  const t = status?.totals ?? null;
  const solved = t ? DIFFICULTIES.reduce((n, d) => n + (t.accepted[d] ?? 0), 0) : null;

  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="leetcode-card-body"
        className="flex items-center justify-between gap-4 px-4 py-3.5 text-left"
      >
        {/* `relative()` reads the clock, so the server's "3m ago" can differ from
            the client's at a minute boundary; the mismatch is text-only and harmless. */}
        <span suppressHydrationWarning className="text-small text-mute">
          {statusLine(status)}
          {solved != null && <span className="text-text-2"> · {solved} solved</span>}
        </span>
        <span aria-hidden className={`text-mute transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {open && (
        <div id="leetcode-card-body" className="flex flex-col gap-4 border-t border-line p-4">
          {t && (
            <div className="grid grid-cols-3 divide-x divide-line">
              {DIFFICULTIES.map((d) => (
                <div key={d} className="flex flex-col gap-1.5 p-4">
                  <span className="text-small text-mute capitalize">{d}</span>
                  <span className="tabular font-display text-display font-bold">{t.accepted[d] ?? 0}</span>
                  <span className="text-small text-mute">{t.failed[d] ?? 0} attempted</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <SyncButton />
          </div>

          {pendingTime.length > 0 && (
            <div className="flex flex-col gap-3">
              <span className="font-semibold">How long did these take?</span>
              {pendingTime.map((c) => (
                <div key={c.id} className="flex flex-col gap-2 border-t border-line pt-3 first:border-0 first:pt-0">
                  <span className="text-small text-text-2">
                    {c.title} ·{" "}
                    {c.result === "solved"
                      ? c.attempts && c.attempts > 1
                        ? `solved after ${c.attempts} tries`
                        : "solved first try"
                      : "not solved"}
                  </span>
                  <form action={setMinutes} className="flex gap-2">
                    <input type="hidden" name="checkinId" value={c.id} />
                    {CHIPS.map((m) => {
                      const suggested = c.suggested && Math.abs(c.suggested - m) <= 7;
                      return (
                        <button key={m} name="minutes" value={m} className={`${chip(Boolean(suggested))} flex-1`}>
                          {m === 60 ? "60m+" : `${m}m`}
                        </button>
                      );
                    })}
                  </form>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
