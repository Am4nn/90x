"use client";

import { useActionState, useState } from "react";
import { checkIn, type CheckinState } from "@/app/actions/checkin";
import { RESULTS, TIME_CHIPS } from "@/lib/library/checkin";

const chip = (on: boolean) =>
  `h-10 flex-1 rounded-lg border text-small font-semibold ${on ? "border-cyan bg-cyan-bg text-cyan" : "border-line-2 text-text-2"}`;

export function CheckinPanel({ slug, leetcodeUrl }: { slug: string; leetcodeUrl: string | null }) {
  const [state, action, pending] = useActionState<CheckinState, FormData>(checkIn, {});
  const [result, setResult] = useState<string>("solved");
  const [minutes, setMinutes] = useState<number | null>(30);

  return (
    <form action={action} className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5">
      <input type="hidden" name="problemSlug" value={slug} />
      <input type="hidden" name="result" value={result} />
      <input type="hidden" name="minutes" value={minutes ?? ""} />
      <div className="flex flex-col gap-2.5">
        <span className="text-small font-semibold text-text-2">How did it go?</span>
        <div className="flex gap-2">
          {RESULTS.map((r) => (
            <button key={r.value} type="button" className={chip(result === r.value)} onClick={() => setResult(r.value)}>{r.label}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="text-small font-semibold text-text-2">Time</span>
        <div className="flex gap-2">
          {TIME_CHIPS.map((m) => (
            <button key={m} type="button" className={chip(minutes === m)} onClick={() => setMinutes(minutes === m ? null : m)}>
              {m === 60 ? "60m+" : `${m}m`}
            </button>
          ))}
        </div>
      </div>
      <textarea name="note" rows={2} placeholder="Note (only you see this)"
        className="rounded-xl border border-line-2 bg-background p-3 text-text outline-none focus:border-cyan" />
      {state.error && <p role="alert" className="text-small text-bad">{state.error}</p>}
      {state.ok && <p className="text-small text-ok">Checked in.</p>}
      <div className="flex gap-2.5">
        {leetcodeUrl && (
          <a href={leetcodeUrl} target="_blank" rel="noreferrer" className="flex h-11 flex-1 items-center justify-center rounded-xl border border-line-2 font-semibold text-text">
            Open on LeetCode
          </a>
        )}
        <button disabled={pending} aria-busy={pending || undefined} className="h-11 flex-1 rounded-xl bg-cyan font-bold text-on-cyan disabled:opacity-60">
          {pending ? "Saving…" : "Check in"}
        </button>
      </div>
    </form>
  );
}
