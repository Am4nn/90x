"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { checkIn, type CheckinState } from "@/app/actions/checkin";
import { saveSyncedDetails, type SyncedCheckin, type SyncedDetailsState, syncForProblem } from "@/app/actions/sync";
import { button, chip } from "@/components/button-styles";
import { Busy } from "@/components/form";
import { XpGain } from "@/components/xp-gain";
import { relative } from "@/lib/format/time";
import { nearestTimeChip, RESULTS, TIME_CHIPS } from "@/lib/library/checkin";

// The result buttons are secondary and rectangular, not the rounded
// pill a chip is. The selected one keeps the chip's accent look so `aria-pressed`
// still reads as a choice, matching the mock's Solved / Hints / Missed row.
const resultBtn = (on: boolean) =>
  `inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-small font-semibold transition-colors disabled:opacity-50 ${
    on ? "border-cyan bg-cyan-bg text-cyan" : "border-line-2 bg-surface text-text hover:border-mute hover:bg-surface-2"
  }`;

const tag = (tint: "ok" | "mute") =>
  `rounded-lg px-2 py-1 text-tag font-bold ${tint === "ok" ? "bg-ok/15 text-ok" : "bg-mute/15 text-mute"}`;

export function CheckinPanel({
  slug,
  patternSlug,
  syncEnabled,
  last,
}: {
  slug: string;
  patternSlug: string | null;
  syncEnabled: boolean;
  /** Right-aligned "Last: hints · 3d ago" meta, preformatted by the server. */
  last: string | null;
}) {
  const [state, action, pending] = useActionState<CheckinState, FormData>(checkIn, {});
  const [details, saveDetails, saving] = useActionState<SyncedDetailsState, FormData>(saveSyncedDetails, {});
  const [result, setResult] = useState<string>("solved");
  const [minutes, setMinutes] = useState<number | null>(30);
  const [syncing, startSync] = useTransition();
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  // Once sync has logged this problem (this tap, or an earlier sync) the panel
  // switches to the "logged from LeetCode" state: the check-in already exists, so
  // the reader can only add details to it, never log it a second time.
  const [synced, setSynced] = useState<SyncedCheckin | null>(null);
  const [usedHints, setUsedHints] = useState(false);

  // The sync path can only ever set solved or failed and, when it measured one,
  // a time. It never touches hints: a submission carries no hint signal, so
  // "Used hints?" is the only way a synced check-in becomes a hints check-in.
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
      const time = nearestTimeChip(attempt.minutes);
      setSynced(attempt);
      // A hints check-in is a solve the reader marked; the tag shows LeetCode's view.
      setResult(attempt.result === "failed" ? "failed" : "solved");
      setMinutes(time);
      setUsedHints(attempt.result === "hints");
      const tries = attempt.attempts > 1 ? ` after ${attempt.attempts} tries` : "";
      setSyncNote(
        attempt.result === "failed"
          ? `LeetCode: no accepted submission${tries}.`
          : `LeetCode: solved${tries}. ${time ? `Time ${time}m — adjust it if you like.` : "No time measured; add one if you want."}`,
      );
    });
  }

  const checkinId = synced?.checkinId ?? state.checkinId;
  const reviewHref = `/library/problem/${slug}/review${checkinId ? `?checkin=${checkinId}` : ""}`;
  // "Used hints?" overrides the synced result; the hidden field posts what the
  // user chose, while the tag still shows what LeetCode measured.
  const effectiveResult = usedHints ? "hints" : result;
  const resultLabel = RESULTS.find((r) => r.value === result)?.label ?? "Solved";

  return (
    <form action={action} className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5">
      <input type="hidden" name="problemSlug" value={slug} />
      <input type="hidden" name="result" value={effectiveResult} />
      <input type="hidden" name="minutes" value={minutes ?? ""} />
      {synced && <input type="hidden" name="checkinId" value={synced.checkinId} />}
      {synced && <input type="hidden" name="hints" value={usedHints ? "1" : ""} />}

      {synced ? (
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-semibold text-text">
            <span className="text-ok">✓</span> Logged from LeetCode
          </span>
          <span className="text-small text-mute">{relative(synced.at)}</span>
        </div>
      ) : (
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold text-text">Check in</span>
          {last && <span className="text-small text-mute">{last}</span>}
        </div>
      )}

      {!synced && syncEnabled && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            aria-busy={syncing || undefined}
            className={`${button({ size: "md" })} w-full`}
          >
            <Busy busy={syncing}>{syncing ? "Syncing…" : "Sync with LeetCode"}</Busy>
          </button>
          <p className="text-small text-mute">Pulls your submission, solved, time taken, hints, so the log is real. Or check in by hand.</p>
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

      {synced ? (
        <div className="flex flex-wrap gap-2">
          <span className={tag("ok")}>{resultLabel}</span>
          {minutes && <span className={tag("mute")}>{minutes}m</span>}
          <span className={tag("mute")}>{synced.attempts > 1 ? `${synced.attempts} tries` : "first try"}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <span className="text-small font-semibold text-text-2">How did it go?</span>
          <div className="flex gap-2">
            {RESULTS.map((r) => (
              <button
                key={r.value}
                type="button"
                aria-pressed={result === r.value}
                className={resultBtn(result === r.value)}
                onClick={() => setResult(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <span className="text-small font-semibold text-text-2">Time taken</span>
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

      {synced && synced.result !== "failed" && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-small">Used hints?</span>
          <button
            type="button"
            role="switch"
            aria-label="Used hints?"
            aria-checked={usedHints}
            onClick={() => setUsedHints((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${usedHints ? "bg-cyan" : "bg-line-2"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full transition-transform ${usedHints ? "translate-x-5 bg-on-cyan" : "translate-x-0.5 bg-text-2"}`}
            />
          </button>
        </div>
      )}

      <textarea
        name="note"
        rows={2}
        placeholder="Add a note…"
        className="rounded-xl border border-line-2 bg-background p-3 text-text outline-none placeholder:text-mute focus:border-cyan"
      />

      {state.error && (
        <p role="alert" className="text-small text-bad">
          {state.error}
        </p>
      )}

      {state.ok && (
        <div className="flex flex-col gap-2.5 border-t border-line pt-4">
          <p className="text-small text-ok">Checked in.{result === "solved" && minutes ? ` Logged ${minutes}m.` : ""}</p>
          <XpGain xp={state.xp} bonus={state.bonus} />
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

      {details.error && (
        <p role="alert" className="text-small text-bad">
          {details.error}
        </p>
      )}

      {synced ? (
        // Already in the log: the details are optional, and saving them updates that check-in.
        <div className="flex flex-wrap items-center gap-2">
          <button
            formAction={saveDetails}
            disabled={saving}
            aria-busy={saving || undefined}
            className={button({ variant: "primary", size: "sm" })}
          >
            <Busy busy={saving}>{saving ? "Saving…" : "Save details"}</Busy>
          </button>
          <Link href={reviewHref} className={button({ size: "sm" })}>
            Review solution
          </Link>
          {details.ok && !saving && (
            <span role="status" className="text-small text-ok">
              Saved.
            </span>
          )}
        </div>
      ) : (
        <button disabled={pending} aria-busy={pending || undefined} className={button({ variant: "primary", size: "lg" })}>
          <Busy busy={pending}>{pending ? "Saving…" : "Check in"}</Busy>
        </button>
      )}
    </form>
  );
}
