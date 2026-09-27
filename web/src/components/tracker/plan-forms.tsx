"use client";

import { useActionState, useState } from "react";
import { setFocusAction, setLengthAction, setTemplatesAction, startCampaignAction } from "@/app/actions/plan";
import { ChipGroup } from "@/components/chip-group";
import { FormMessage, type FormState, SubmitButton } from "@/components/form";
import { BUDGETS } from "@/lib/setup";
import type { Weekday } from "@/lib/tracker/dates";
import { MAX_PER_SLOT, SLOT_MINUTES, SLOT_TYPES, type SlotType, type Templates, templateMinutes } from "@/lib/tracker/template";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const SLOT_LABEL: Record<SlotType, string> = { new_problem: "New", review: "Review", topic: "Topic", cards: "Cards" };
const LENGTHS = [30, 60, 90];

const chip = (on: boolean) =>
  `h-10 rounded-full border px-4 text-small font-semibold ${on ? "border-cyan bg-cyan-bg text-cyan" : "border-line-2 text-text-2 hover:border-mute hover:text-text"}`;
const secondary = "h-10 rounded-xl border border-line-2 px-4 text-small font-semibold text-text disabled:opacity-60";

function hours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

export function StartCampaignForm() {
  const [state, action] = useActionState<FormState, FormData>(startCampaignAction, {});
  const [length, setLength] = useState(90);
  return (
    <form action={action} className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5">
      <input type="hidden" name="length" value={length} />
      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 text-small font-semibold text-text-2">Length</legend>
        <div className="flex flex-wrap gap-2">
          {LENGTHS.map((d) => (
            <button key={d} type="button" className={chip(length === d)} onClick={() => setLength(d)}>
              {d} days
            </button>
          ))}
        </div>
      </fieldset>
      <ChipGroup name="weekday" label="Time per weekday" options={BUDGETS} defaultValue="120" />
      <ChipGroup name="weekend" label="Time per weekend day" options={BUDGETS} defaultValue="180" />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Starting…">Start campaign</SubmitButton>
    </form>
  );
}

export function LengthForm({ current, minimum }: { current: number; minimum: number }) {
  const [state, action] = useActionState<FormState, FormData>(setLengthAction, {});
  const [custom, setCustom] = useState(!LENGTHS.includes(current));
  const [length, setLength] = useState(current);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {LENGTHS.map((d) => (
          <button
            key={d}
            type="button"
            disabled={d < minimum}
            className={`${chip(!custom && length === d)} disabled:opacity-40`}
            onClick={() => {
              setLength(d);
              setCustom(false);
            }}
          >
            {d} days
          </button>
        ))}
        <button type="button" className={chip(custom)} onClick={() => setCustom(true)}>
          Custom
        </button>
        {custom && (
          <input
            type="number"
            min={Math.max(7, minimum)}
            max={365}
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
            aria-label="Days"
            className="h-10 w-24 rounded-xl border border-line-2 bg-surface px-3 text-text outline-none focus:border-cyan"
          />
        )}
      </div>
      <input type="hidden" name="length" value={length} />
      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Saving…" className={secondary}>
          Save length
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const btn = "grid size-8 place-items-center rounded-lg border border-line-2 text-text-2 hover:text-text disabled:opacity-30";
  return (
    <div className="flex items-center justify-center gap-1.5" role="group" aria-label={label}>
      <button type="button" className={btn} disabled={value <= 0} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label}`}>
        −
      </button>
      <span className="tabular w-5 text-center font-semibold">{value}</span>
      <button
        type="button"
        className={btn}
        disabled={value >= MAX_PER_SLOT}
        onClick={() => onChange(value + 1)}
        aria-label={`More ${label}`}
      >
        +
      </button>
    </div>
  );
}

export function TemplateEditor({ initial }: { initial: Templates }) {
  const [state, action] = useActionState<FormState, FormData>(setTemplatesAction, {});
  const [templates, setTemplates] = useState(initial);
  const set = (day: Weekday, slot: SlotType, v: number) =>
    setTemplates((t) => {
      const next = { ...t };
      next[day] = { ...t[day], [slot]: v };
      return next;
    });

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="templates" value={JSON.stringify(templates)} />
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[520px] text-small">
          <thead>
            <tr className="text-mute">
              <th className="px-4 py-3 text-left font-semibold">Day</th>
              {SLOT_TYPES.map((s) => (
                <th key={s} className="px-2 py-3 font-semibold">
                  {SLOT_LABEL[s]} <span className="font-normal">· {SLOT_MINUTES[s]}m</span>
                </th>
              ))}
              <th className="px-4 py-3 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {WEEK_ORDER.map((d) => (
              <tr key={d} className="border-t border-line">
                <td className="px-4 py-2.5 font-semibold text-text">{DAY_NAMES[d]}</td>
                {SLOT_TYPES.map((s) => (
                  <td key={s} className="px-2 py-2.5">
                    <Stepper value={templates[d][s]} onChange={(v) => set(d, s, v)} label={`${SLOT_LABEL[s]} on ${DAY_NAMES[d]}`} />
                  </td>
                ))}
                <td className="tabular px-4 py-2.5 text-right text-text-2">{hours(templateMinutes(templates[d]))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-small text-mute">A card slot is 10 answers in the Feed. Each day also needs a problem, review or topic.</p>
      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Saving…" className={secondary}>
          Save plan
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function FocusForm({ companies, current }: { companies: string[]; current: { company: string; to: string } | null }) {
  const [state, action] = useActionState<FormState, FormData>(setFocusAction, {});
  const [company, setCompany] = useState(current?.company ?? "");
  const [weeks, setWeeks] = useState(1);
  return (
    <form action={action} className="flex flex-col gap-4">
      {current && (
        <p className="text-small text-text-2">
          Focusing on <b className="text-text">{current.company}</b> until {current.to}.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {companies.map((c) => (
          <button key={c} type="button" className={chip(company === c)} onClick={() => setCompany(company === c ? "" : c)}>
            {c}
          </button>
        ))}
      </div>
      <input
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        placeholder="Or type a company"
        className="h-10 rounded-xl border border-line-2 bg-surface px-3.5 text-text outline-none focus:border-cyan"
      />
      <input type="hidden" name="company" value={company} />
      <input type="hidden" name="weeks" value={weeks} />
      <div className="flex flex-wrap gap-2">
        {[1, 2, 4].map((w) => (
          <button key={w} type="button" className={chip(weeks === w)} onClick={() => setWeeks(w)}>
            {w === 1 ? "1 week" : `${w} weeks`}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Saving…" className={secondary}>
          {company ? "Set focus" : "Clear focus"}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
