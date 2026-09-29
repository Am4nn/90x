"use client";

import { useActionState, useState } from "react";
import {
  setFocusAction,
  setLengthAction,
  setLevelAction,
  setTemplatesAction,
  setWeekAction,
  startCampaignAction,
} from "@/app/actions/plan";
import { button, chip } from "@/components/button-styles";
import { ChipGroup } from "@/components/chip-group";
import { FormMessage, type FormState, SubmitButton } from "@/components/form";
import { BUDGETS, LEVELS } from "@/lib/setup";
import { DAY_NAMES, type Weekday, addDays } from "@/lib/tracker/dates";
import { type Level, asLevel } from "@/lib/tracker/level";
import {
  MAX_PER_SLOT,
  SLOT_LABEL_SHORT,
  SLOT_MINUTES,
  SLOT_TYPES,
  proposeTemplate,
  templateMinutes,
  type SlotType,
  type Templates,
} from "@/lib/tracker/template";
import { WeekPreview, hours } from "./week-preview";

const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const LENGTHS = [30, 60, 90];

const secondary = button();

/** How much a level changes, said once so both flows explain it the same way. */
const LEVEL_HINT = "Leans the mix of your week and the difficulty of the problems you start on.";

function LengthChips({
  length,
  custom,
  minimum = 0,
  onPick,
  onCustom,
}: {
  length: number;
  custom: boolean;
  /** Days already done; a length below this cannot be saved. */
  minimum?: number;
  onPick: (days: number) => void;
  onCustom: () => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-2.5 text-small font-semibold text-text-2">How long</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LENGTHS.map((d) => (
          <button key={d} type="button" disabled={d < minimum} className={chip(!custom && length === d)} onClick={() => onPick(d)}>
            {d} days
          </button>
        ))}
        <button type="button" className={chip(custom)} onClick={onCustom}>
          Custom
        </button>
      </div>
    </fieldset>
  );
}

/** Starting a plan: level, length, time, and the week those add up to. */
export function StartPlanForm({ level, weekday, weekend }: { level: Level; weekday: string; weekend: string }) {
  const [state, action] = useActionState<FormState, FormData>(startCampaignAction, {});
  const [length, setLength] = useState(90);
  const [custom, setCustom] = useState(false);
  const [chosen, setChosen] = useState<Level>(level);
  const [wd, setWd] = useState(weekday);
  const [we, setWe] = useState(weekend);
  const minutes = { weekday: Number(wd), weekend: Number(we) };
  return (
    <form action={action} className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5">
      <input type="hidden" name="length" value={length} />
      <div className="flex flex-col gap-2.5">
        <ChipGroup
          name="level"
          label="Your level"
          options={LEVELS}
          defaultValue={level}
          value={chosen}
          onChange={(v) => setChosen(asLevel(v) ?? chosen)}
        />
        <p className="text-small text-mute">{LEVEL_HINT}</p>
      </div>
      <div className="flex flex-col gap-2.5">
        <LengthChips
          length={length}
          custom={custom}
          onPick={(d) => {
            setLength(d);
            setCustom(false);
          }}
          onCustom={() => setCustom(true)}
        />
        {custom && (
          <input
            type="number"
            min={7}
            max={365}
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
            aria-label="Days"
            className="h-10 w-24 rounded-xl border border-line-2 bg-surface px-3 text-text outline-none focus:border-cyan"
          />
        )}
      </div>
      <ChipGroup name="weekday" label="Time on a weekday" options={BUDGETS} defaultValue={weekday} value={wd} onChange={setWd} />
      <ChipGroup name="weekend" label="Time at the weekend" options={BUDGETS} defaultValue={weekend} value={we} onChange={setWe} />
      <WeekPreview templates={proposeTemplate(minutes.weekday, minutes.weekend, chosen)} budgets={minutes} />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Starting…">Start your plan</SubmitButton>
    </form>
  );
}

/** Changing a length that is already running. `startDate` is what makes the end
 *  date truthful: `setLength` writes the length and nothing else, so the days
 *  already done keep their squares and the end date follows. */
function LengthForm({ current, minimum, startDate }: { current: number; minimum: number; startDate: string }) {
  const [state, action] = useActionState<FormState, FormData>(setLengthAction, {});
  const [custom, setCustom] = useState(!LENGTHS.includes(current));
  const [length, setLength] = useState(current);
  return (
    <form action={action} className="flex flex-col gap-3">
      <LengthChips
        length={length}
        custom={custom}
        minimum={minimum}
        onPick={(d) => {
          setLength(d);
          setCustom(false);
        }}
        onCustom={() => setCustom(true)}
      />
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
      <input type="hidden" name="length" value={length} />
      <p className="text-small text-mute">
        Day {minimum} of {length} · ends {addDays(startDate, length - 1)}. Days you have done keep their squares; the end date follows the
        length.
      </p>
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
  const btn =
    "grid size-7 place-items-center rounded-lg border border-line-2 text-text-2 hover:border-mute hover:text-text disabled:opacity-30";
  return (
    <div className="flex items-center justify-center gap-1" role="group" aria-label={label}>
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

function TemplateEditor({ initial }: { initial: Templates }) {
  const [state, action] = useActionState<FormState, FormData>(setTemplatesAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {/* The working copy is keyed by its initial value so a "Rebuild the week"
          resets it to the rebuilt week, while this form keeps its own save note
          through that remount (a remount here would clear "Saved."). */}
      <EditorBody key={JSON.stringify(initial)} initial={initial} />
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

/** The day-by-day working copy. Keyed by its initial value so a rebuild resets
 *  it; editing a stepper changes only this component's own state. */
function EditorBody({ initial }: { initial: Templates }) {
  const [templates, setTemplates] = useState(initial);
  const set = (day: Weekday, slot: SlotType, v: number) =>
    setTemplates((t) => {
      const next = { ...t };
      next[day] = { ...t[day], [slot]: v };
      return next;
    });

  return (
    <>
      <input type="hidden" name="templates" value={JSON.stringify(templates)} />
      {/* Phones: one card per day, since four steppers across don't fit. */}
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface md:hidden">
        {WEEK_ORDER.map((d) => (
          <li key={d} className="flex flex-col gap-3 px-4 py-3.5">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-text">{DAY_NAMES[d]}</span>
              <span className="tabular text-small text-text-2">{hours(templateMinutes(templates[d]))}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              {SLOT_TYPES.map((s) => (
                <div key={s} className="flex items-center justify-between gap-2">
                  <span className="flex flex-col">
                    <span className="text-small font-semibold text-text-2">{SLOT_LABEL_SHORT[s]}</span>
                    <span className="text-tag text-mute">{SLOT_MINUTES[s]}m each</span>
                  </span>
                  <Stepper value={templates[d][s]} onChange={(v) => set(d, s, v)} label={`${SLOT_LABEL_SHORT[s]} on ${DAY_NAMES[d]}`} />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface md:block">
        <table className="w-full text-small">
          <thead>
            <tr className="text-mute">
              <th className="px-3 py-3 text-left font-semibold">Day</th>
              {SLOT_TYPES.map((s) => (
                <th key={s} className="px-1.5 py-3 font-semibold">
                  <span className="block">{SLOT_LABEL_SHORT[s]}</span>
                  <span className="block font-normal">{SLOT_MINUTES[s]}m</span>
                </th>
              ))}
              <th className="px-3 py-3 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {WEEK_ORDER.map((d) => (
              <tr key={d} className="border-t border-line">
                <td className="px-3 py-2.5 font-semibold text-text">{DAY_NAMES[d]}</td>
                {SLOT_TYPES.map((s) => (
                  <td key={s} className="px-1.5 py-2.5">
                    <Stepper value={templates[d][s]} onChange={(v) => set(d, s, v)} label={`${SLOT_LABEL_SHORT[s]} on ${DAY_NAMES[d]}`} />
                  </td>
                ))}
                <td className="tabular px-3 py-2.5 text-right whitespace-nowrap text-text-2">{hours(templateMinutes(templates[d]))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** The day-by-day editor, folded away until it is asked for. */
function AdjustTheWeek({ initial }: { initial: Templates }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`${button({ variant: "ghost" })} h-auto w-full justify-between border border-line bg-surface px-4 py-3.5 text-left`}
      >
        <span>Adjust the week</span>
        <span className="text-small font-normal text-mute">{open ? "Hide" : "Mon–Sun by hand"}</span>
      </button>
      {open && <TemplateEditor initial={initial} />}
    </section>
  );
}

/** A plan that is already running: the same choices, and what they add up to. */
export function PlanEditor({
  level,
  weekday,
  weekend,
  length,
  minimum,
  startDate,
  templates,
}: {
  level: Level;
  weekday: string;
  weekend: string;
  length: number;
  minimum: number;
  startDate: string;
  templates: Templates;
}) {
  const [levelState, levelAction] = useActionState<FormState, FormData>(setLevelAction, {});
  const [weekState, weekAction] = useActionState<FormState, FormData>(setWeekAction, {});
  const [chosen, setChosen] = useState<Level>(level);
  const [wd, setWd] = useState(weekday);
  const [we, setWe] = useState(weekend);
  const minutes = { weekday: Number(wd), weekend: Number(we) };
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_22rem] md:items-start md:gap-8">
      <div className="flex flex-col gap-6 md:col-start-1 md:row-start-1">
        <form action={levelAction} className="flex flex-col gap-3">
          <ChipGroup
            name="level"
            label="Your level"
            options={LEVELS}
            defaultValue={level}
            value={chosen}
            onChange={(v) => setChosen(asLevel(v) ?? chosen)}
          />
          <p className="text-small text-mute">{LEVEL_HINT}</p>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pendingLabel="Saving…" className={secondary}>
              Save level
            </SubmitButton>
            <FormMessage state={levelState} />
          </div>
        </form>
        <LengthForm current={length} minimum={minimum} startDate={startDate} />
        <form action={weekAction} className="flex flex-col gap-3">
          <ChipGroup name="weekday" label="Time on a weekday" options={BUDGETS} defaultValue={weekday} value={wd} onChange={setWd} />
          <ChipGroup name="weekend" label="Time at the weekend" options={BUDGETS} defaultValue={weekend} value={we} onChange={setWe} />
          <input type="hidden" name="level" value={chosen} />
          <p className="text-small text-mute">Rebuilds this week from these times. Adjust it by hand afterwards.</p>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pendingLabel="Rebuilding…" className={secondary}>
              Rebuild the week
            </SubmitButton>
            <FormMessage state={weekState} />
          </div>
        </form>
      </div>
      {/* Before the editor in the DOM, so the week reads straight after the
          choices on a phone; the right column on a desktop. */}
      <div className="md:col-start-2 md:row-span-2 md:row-start-1">
        <WeekPreview
          templates={proposeTemplate(minutes.weekday, minutes.weekend, chosen)}
          budgets={minutes}
          note="Rebuild the week to apply"
        />
      </div>
      <div className="md:col-start-1 md:row-start-2">
        <AdjustTheWeek initial={templates} />
      </div>
    </div>
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
