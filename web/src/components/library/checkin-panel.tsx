"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { checkIn, type CheckinState } from "@/app/actions/checkin";
import { syncForProblem } from "@/app/actions/sync";
import { button, chip } from "@/components/button-styles";
import { nearestTimeChip, RESULTS, TIME_CHIPS } from "@/lib/library/checkin";

export function CheckinPanel({ slug, patternSlug, syncEnabled }: { slug: string; patternSlug: string | null; syncEnabled: boolean }) {
  const [state, action, pending] = useActionState<CheckinState, FormData>(checkIn, {});
  const [result, setResult] = useState<string>("solved");
  const [minutes, setMinutes] = useState<number | null>(30);
  const [syncing, startSync] = useTransition();
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // The sync path can only ever set solved or failed and, when it measured one,
  // a time. It never touches hints: a submission carries no hint signal.
  function onSync() {
    setSyncError(null);
    setSyncNote(null);
    startSync(async () => {
      const found = await syncForProblem(slug).catch(() => null);
      if (!found) {
        setSyncError("Couldn't reach 90x. Check your connection and try again.");
        return;
      }
      if ("error" in found) {
        setSyncError(found.error);
        return;
      }
      if (!found.found) {
        setSyncNote("No recent submission for this one.");
        return;
      }
      const attempt = found.found;
      const time = nearestTimeChip(attempt.minutesSuggested);
      setResult(attempt.result);
      setMinutes(time);
      const tries = attempt.attempts > 1 ? ` after ${attempt.attempts} tries` : "";
      setSyncNote(
        attempt.result === "solved"
          ? `LeetCode: solved${tries}. ${time ? `Suggested ${time}m — adjust it if you like.` : "No time suggested; add one if you want."}`
          : `LeetCode: no accepted submission${tries}.`,
      );
    });
  }

  const reviewHref = `/library/problem/${slug}/review${state.checkinId ? `?checkin=${state.checkinId}` : ""}`;

  return (
    <form action={action} className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5">
      <input type="hidden" name="problemSlug" value={slug} />
      <input type="hidden" name="result" value={result} />
      <input type="hidden" name="minutes" value={minutes ?? ""} />

      <div className="flex flex-col gap-1">
        <span className="font-semibold text-text">Check in</span>
        <span className="text-small text-mute">Log how it went. A note stays visible, synced or not.</span>
      </div>

      {syncEnabled && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            aria-busy={syncing || undefined}
            className={`${button({ size: "md" })} w-full`}
          >
            {syncing ? "Syncing…" : "Sync with LeetCode"}
          </button>
          <p className="text-small text-mute">
            Pulls your latest submission: solved, and a time when LeetCode measured one. Hints stay manual.
          </p>
          {syncError && (
            <p role="alert" className="text-small text-bad">
              {syncError}
            </p>
          )}
          {syncNote && (
            <p role="status" className="text-small text-text-2">
              {syncNote}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <span className="text-small font-semibold text-text-2">How did it go?</span>
        <div className="flex gap-2">
          {RESULTS.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={result === r.value}
              className={`${chip(result === r.value)} flex-1`}
              onClick={() => setResult(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="text-small font-semibold text-text-2">Time</span>
        <div className="flex gap-2">
          {TIME_CHIPS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={minutes === m}
              className={`${chip(minutes === m)} flex-1`}
              onClick={() => setMinutes(minutes === m ? null : m)}
            >
              {m === 60 ? "60m+" : `${m}m`}
            </button>
          ))}
        </div>
      </div>
      <textarea
        name="note"
        rows={2}
        placeholder="Note (only you see this)"
        className="rounded-xl border border-line-2 bg-background p-3 text-text outline-none focus:border-cyan"
      />

      {state.error && (
        <p role="alert" className="text-small text-bad">
          {state.error}
        </p>
      )}

      {state.ok && (
        <div className="flex flex-col gap-2.5 border-t border-line pt-4">
          <p className="text-small text-ok">Checked in.{result === "solved" && minutes ? ` Logged ${minutes}m.` : ""}</p>
          <div className="flex flex-wrap gap-2">
            {result === "failed" && patternSlug && (
              <Link href={`/coach?kind=lesson&ref=${patternSlug}`} className={button({ size: "sm" })}>
                Learn this pattern
              </Link>
            )}
            <Link href={reviewHref} className={button({ variant: "primary", size: "sm" })}>
              Review solution
            </Link>
          </div>
        </div>
      )}

      <button disabled={pending} aria-busy={pending || undefined} className={button({ variant: "primary", size: "lg" })}>
        {pending ? "Saving…" : "Check in"}
      </button>
    </form>
  );
}
