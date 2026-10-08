"use client";

import { useActionState, useState } from "react";
import { Logo } from "@/components/brand";
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

/** The 4-dot step progress. A labelled list so the current
 *  step stays announced; visually the current dot is a pill and the earlier
 *  ones are filled. */
function Dots({ total, current }: { total: number; current: number }) {
  return (
    <ol aria-label="Set up steps" className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <li
          key={i}
          aria-current={i === current - 1 ? "step" : undefined}
          className={`h-2 rounded-full ${i < current ? "w-6 bg-cyan" : "w-2 bg-line-2"}`}
        >
          <span className="sr-only">Step {i + 1}</span>
        </li>
      ))}
    </ol>
  );
}

export function SetupForm({ defaults }: { defaults: { name: string; timezone: string } }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(saveSetup, {});
  const [step, setStep] = useState(0);
  const [days, setDays] = useState(90);
  const [custom, setCustom] = useState(false);
  const [level, setLevel] = useState<Level>("some_practice");
  const [time, setTime] = useState("120");
  const [tz] = useState(() => defaults.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const e = state.errors ?? {};
  // One time-a-day choice drives both weekday and weekend,
  // so the preview and the saved plan share a single value.
  const minutes = { weekday: Number(time), weekend: Number(time) };

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

  const total = STEPS.length - 1; // the four numbered steps after Welcome
  const last = shown === STEPS.length - 1;

  return (
    <form action={action} noValidate className="flex flex-1 flex-col">
      {shown === 0 ? (
        <div className="flex flex-1 flex-col justify-center gap-5 py-8">
          <Logo className="text-display" />
          <h1 className="font-display text-title font-semibold">Prep that plans your day, then checks it.</h1>
          <p className="text-text-2">
            90x picks today&apos;s problems from your weakest areas, grades what you type, and only raises your readiness when you do the
            work.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => move(1)}
            className={`${button({ variant: "primary", size: "lg" })} mt-2 w-full`}
          >
            Get started
          </button>
          <p className="text-center text-small text-mute">About two minutes</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6 py-4 md:py-8">
          <div className="hidden items-baseline justify-between gap-4 md:flex">
            <h1 className="font-display text-title font-semibold">Set up your plan</h1>
            <span className="text-small text-mute">
              Step {shown} of {total}
            </span>
          </div>

          <Dots total={total} current={shown} />

          <section className={shown === 1 ? "flex flex-col gap-6" : "hidden"}>
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-title font-semibold">About you</h2>
              <p className="text-small text-mute">
                Your name, the role you are aiming at and the language you solve in. The Coach writes its code in that language.
              </p>
            </div>
            <Field label="Name" error={e.name}>
              <input name="name" defaultValue={defaults.name} placeholder="Your name" className={input} autoComplete="name" />
            </Field>
            <ChipGroup name="role" label="Target role" options={ROLES} defaultValue="backend" error={e.role} />
            <ChipGroup name="language" label="Language for DSA" options={LANGUAGES} defaultValue="java" error={e.language} />
          </section>

          <section className={shown === 2 ? "flex flex-col gap-6" : "hidden"}>
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-title font-semibold">How much practice have you had?</h2>
              <p className="text-small text-mute">
                So we don&apos;t hand an experienced person Two Sum. It sets starting difficulty and the mix.
              </p>
            </div>
            <div role="radiogroup" aria-label="Your level" className="flex flex-col gap-2.5">
              <input type="hidden" name="level" value={level} />
              {LEVELS.map((l) => {
                const on = l.value === level;
                return (
                  <button
                    key={l.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setLevel(asLevel(l.value) ?? level)}
                    className={`flex items-center justify-between gap-3 rounded-xl border bg-surface p-4 text-left transition-colors ${
                      on ? "border-cyan" : "border-line hover:border-mute"
                    }`}
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold text-text">{l.label}</span>
                      <span className="text-small text-mute">{l.hint}</span>
                    </span>
                    {on && (
                      <span aria-hidden className="font-bold text-cyan">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
              {e.level && <span className="text-small text-bad">{e.level}</span>}
            </div>
          </section>

          <section className={shown === 3 ? "flex flex-col gap-6" : "hidden"}>
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-title font-semibold">How much time a day?</h2>
              <p className="text-small text-mute">
                How long the plan runs, and how much time you have a day. The week below follows your choices.
              </p>
            </div>
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
            </fieldset>
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
            <ChipGroup
              name="weekday_minutes"
              label="Time a day"
              options={BUDGETS}
              defaultValue="120"
              value={time}
              onChange={setTime}
              error={e.weekday_minutes}
            />
            <input type="hidden" name="weekend_minutes" value={time} />
            <WeekPreview templates={proposeTemplate(minutes.weekday, minutes.weekend, level)} budgets={minutes} />
            <Field label="Time zone" error={e.timezone}>
              <input name="timezone" defaultValue={tz} className={input} />
            </Field>
            <p className="text-small text-mute">Next: connect LeetCode, which is optional.</p>
          </section>

          <section className={shown === 4 ? "flex flex-col gap-6" : "hidden"}>
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-title font-semibold">Connect LeetCode</h2>
              <p className="text-small text-mute">
                Optional. With your username 90x can sync the problems you solve, instead of you logging them by hand.
              </p>
            </div>
            <Field label="LeetCode username (optional, for syncing your solves)" error={e.leetcode_username}>
              <input name="leetcode_username" placeholder="e.g. am4nn" className={input} autoComplete="off" />
            </Field>
            <Switch name="has_leetcode_premium" label="I have LeetCode Premium" />
          </section>

          <div className="flex items-center gap-3">
            {shown > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() => move(shown - 1)}
                className={`${button({ variant: "secondary", size: "lg" })} flex-1`}
              >
                Back
              </button>
            )}
            {last ? (
              <SubmitButton pendingLabel="Starting…" className={`${button({ variant: "primary", size: "lg" })} flex-[2]`}>
                Start my plan
              </SubmitButton>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => move(shown + 1)}
                className={`${button({ variant: "primary", size: "lg" })} flex-[2]`}
              >
                Continue
              </button>
            )}
          </div>
          {state.message && <p className="text-small text-bad">{state.message}</p>}
        </div>
      )}
    </form>
  );
}
