"use client";

import { useActionState, useState } from "react";
import { ChipGroup, Switch } from "@/components/chip-group";
import { BUDGETS, LANGUAGES, ROLES } from "@/lib/setup";
import { saveSetup, type SetupState } from "./actions";

const DURATIONS = [30, 60, 90];

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-small font-semibold text-text-2">{label}</span>
      {children}
      {error && <span className="text-small text-bad">{error}</span>}
    </label>
  );
}

const input = "h-11 rounded-xl border border-line-2 bg-surface px-3.5 text-text outline-none focus:border-cyan";

export function SetupForm({ defaults }: { defaults: { name: string; timezone: string } }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(saveSetup, {});
  const [days, setDays] = useState(90);
  const [custom, setCustom] = useState(false);
  const [tz] = useState(() => defaults.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const e = state.errors ?? {};

  return (
    <form action={action} className="flex flex-col gap-6">
      <Field label="Name" error={e.name}>
        <input name="name" defaultValue={defaults.name} className={input} autoComplete="name" required />
      </Field>
      <ChipGroup name="role" label="Target role" options={ROLES} defaultValue="backend" error={e.role} />
      <ChipGroup name="language" label="Language for DSA" options={LANGUAGES} defaultValue="java" error={e.language} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2.5 text-small font-semibold text-text-2">Campaign length</legend>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDays(d);
                setCustom(false);
              }}
              className={`h-10 rounded-full border px-4 text-small font-semibold ${!custom && days === d ? "border-cyan bg-cyan-bg text-cyan" : "border-line-2 text-text-2"}`}
            >
              {d} days
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustom(true)}
            className={`h-10 rounded-full border px-4 text-small font-semibold ${custom ? "border-cyan bg-cyan-bg text-cyan" : "border-line-2 text-text-2"}`}
          >
            Custom
          </button>
        </div>
        {custom ? (
          <input name="campaign_days" type="number" min={7} max={365} defaultValue={days} className={`${input} w-32`} />
        ) : (
          <input type="hidden" name="campaign_days" value={days} />
        )}
        {e.campaign_days && <span className="text-small text-bad">{e.campaign_days}</span>}
      </fieldset>
      <ChipGroup name="weekday_minutes" label="Time per weekday" options={BUDGETS} defaultValue="120" error={e.weekday_minutes} />
      <ChipGroup name="weekend_minutes" label="Time per weekend day" options={BUDGETS} defaultValue="180" error={e.weekend_minutes} />
      <Field label="Time zone" error={e.timezone}>
        <input name="timezone" defaultValue={tz} className={input} />
      </Field>
      <Field label="LeetCode username (optional, for syncing your solves)" error={e.leetcode_username}>
        <input name="leetcode_username" placeholder="e.g. am4nn" className={input} autoComplete="off" />
      </Field>
      <Switch name="has_leetcode_premium" label="I have LeetCode Premium" />
      {state.message && <p className="text-small text-bad">{state.message}</p>}
      <button
        disabled={pending}
        aria-busy={pending || undefined}
        className="h-12 rounded-xl bg-cyan font-bold text-on-cyan disabled:opacity-60"
      >
        {pending ? "Saving…" : "Start my campaign"}
      </button>
    </form>
  );
}
