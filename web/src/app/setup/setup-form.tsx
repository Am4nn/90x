"use client";

import { useActionState, useState } from "react";
import { button, chip } from "@/components/button-styles";
import { ChipGroup, Switch } from "@/components/chip-group";
import { SubmitButton } from "@/components/form";
import { WeekPreview } from "@/components/tracker/week-preview";
import { BUDGETS, LANGUAGES, LEVELS, ROLES } from "@/lib/setup";
import { type Level, asLevel } from "@/lib/tracker/level";
import { proposeTemplate } from "@/lib/tracker/template";
import { saveSetup, type SetupState } from "./actions";

const DURATIONS = [30, 60, 90];

// Welcome -> You -> Level -> Time -> LeetCode. Every step stays in the DOM, so
// the single form still posts every field it always did; the steps only decide
// what is on screen. `noValidate`, because a browser refusing to submit over a
// hidden input it cannot focus is worse than the server's own message.
const STEPS = [
  { name: "Welcome", fields: [] as string[] },
  { name: "You", fields: ["name", "role", "language"] },
  { name: "Level", fields: ["level"] },
  { name: "Time", fields: ["campaign_days", "timezone", "weekday_minutes", "weekend_minutes"] },
  { name: "LeetCode", fields: ["leetcode_username", "has_leetcode_premium"] },
];

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
  const [step, setStep] = useState(0);
  const [days, setDays] = useState(90);
  const [custom, setCustom] = useState(false);
  const [level, setLevel] = useState<Level>("some_practice");
  const [weekday, setWeekday] = useState("120");
  const [weekend, setWeekend] = useState("180");
  const [tz] = useState(() => defaults.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const e = state.errors ?? {};
  const minutes = { weekday: Number(weekday), weekend: Number(weekend) };

  // A rejected field can sit on a step the reader has already left, so show that
  // step until they move themselves. Comparing the result object rather than a
  // counter keeps this derived, not an effect that sets state again.
  const [answered, setAnswered] = useState<SetupState | null>(null);
  const rejected = state === answered ? -1 : STEPS.findIndex((s) => s.fields.some((field) => e[field]));
  const shown = rejected > 0 ? rejected : step;
  const move = (next: number) => {
    setAnswered(state);
    setStep(next);
  };

  const last = shown === STEPS.length - 1;
  const hint = LEVELS.find((l) => l.value === level)?.hint;

  return (
    <form action={action} noValidate className="flex flex-col gap-6">
      <ol aria-label="Set up steps" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
        {STEPS.map((s, i) => (
          <li
            key={s.name}
            aria-current={i === shown ? "step" : undefined}
            className={i === shown ? "font-semibold text-text" : "text-mute"}
          >
            {s.name}
          </li>
        ))}
      </ol>

      <section className={shown === 0 ? "flex flex-col gap-3" : "hidden"}>
        <h2 className="font-display text-title font-semibold">Prep that plans your day, then checks it.</h2>
        <p className="text-text-2">
          90x picks today&apos;s problems from your weakest areas, grades what you type, and only raises your readiness when you do the
          work.
        </p>
        <p className="text-small text-mute">About two minutes.</p>
      </section>

      <section className={shown === 1 ? "flex flex-col gap-6" : "hidden"}>
        <p className="text-text-2">
          Your name, the role you are aiming at and the language you solve in. The Coach writes its code in that language.
        </p>
        <Field label="Name" error={e.name}>
          <input name="name" defaultValue={defaults.name} className={input} autoComplete="name" />
        </Field>
        <ChipGroup name="role" label="Target role" options={ROLES} defaultValue="backend" error={e.role} />
        <ChipGroup name="language" label="Language for DSA" options={LANGUAGES} defaultValue="java" error={e.language} />
      </section>

      <section className={shown === 2 ? "flex flex-col gap-6" : "hidden"}>
        <p className="text-text-2">
          So we don&apos;t hand an experienced person Two Sum. It sets the mix of missions and the starting difficulty.
        </p>
        <div className="flex flex-col gap-2.5">
          <ChipGroup
            name="level"
            label="Your level"
            options={LEVELS}
            defaultValue="some_practice"
            value={level}
            onChange={(v) => setLevel(asLevel(v) ?? level)}
          />
          {hint && <p className="text-small text-mute">{hint}</p>}
        </div>
      </section>

      <section className={shown === 3 ? "flex flex-col gap-6" : "hidden"}>
        <p className="text-text-2">How long the plan runs, and how much time you have a day. The week below follows your choices.</p>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-small font-semibold text-text-2">How long</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDays(d);
                  setCustom(false);
                }}
                className={chip(!custom && days === d)}
              >
                {d} days
              </button>
            ))}
            <button type="button" onClick={() => setCustom(true)} className={chip(custom)}>
              Custom
            </button>
          </div>
          {custom ? (
            <input
              name="campaign_days"
              type="number"
              min={7}
              max={365}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              aria-label="Days"
              className={`${input} w-32`}
            />
          ) : (
            <input type="hidden" name="campaign_days" value={days} />
          )}
          {e.campaign_days && <span className="text-small text-bad">{e.campaign_days}</span>}
        </fieldset>
        <ChipGroup
          name="weekday_minutes"
          label="Time on a weekday"
          options={BUDGETS}
          defaultValue="120"
          value={weekday}
          onChange={setWeekday}
          error={e.weekday_minutes}
        />
        <ChipGroup
          name="weekend_minutes"
          label="Time at the weekend"
          options={BUDGETS}
          defaultValue="180"
          value={weekend}
          onChange={setWeekend}
          error={e.weekend_minutes}
        />
        <WeekPreview templates={proposeTemplate(minutes.weekday, minutes.weekend, level)} budgets={minutes} />
        <Field label="Time zone" error={e.timezone}>
          <input name="timezone" defaultValue={tz} className={input} />
        </Field>
        <p className="text-small text-mute">Next: LeetCode, which is optional.</p>
      </section>

      <section className={shown === 4 ? "flex flex-col gap-6" : "hidden"}>
        <p className="text-text-2">
          Optional. With your username 90x can sync the problems you solve, instead of you logging them by hand.
        </p>
        <Field label="LeetCode username (optional, for syncing your solves)" error={e.leetcode_username}>
          <input name="leetcode_username" placeholder="e.g. am4nn" className={input} autoComplete="off" />
        </Field>
        <Switch name="has_leetcode_premium" label="I have LeetCode Premium" />
      </section>

      <div className="flex items-center gap-3">
        {shown > 0 && (
          <button type="button" disabled={pending} onClick={() => move(shown - 1)} className={button({ variant: "secondary", size: "lg" })}>
            Back
          </button>
        )}
        {last ? (
          <SubmitButton pendingLabel="Starting…">Start my plan</SubmitButton>
        ) : (
          <button type="button" disabled={pending} onClick={() => move(shown + 1)} className={button({ variant: "primary", size: "lg" })}>
            {shown === 0 ? "Get started" : "Continue"}
          </button>
        )}
      </div>
      {state.message && <p className="text-small text-bad">{state.message}</p>}
    </form>
  );
}
