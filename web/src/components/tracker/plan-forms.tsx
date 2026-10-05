"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
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
  dayMinutes,
  type SlotType,
  type Templates,
} from "@/lib/tracker/template";
import { WeekPreview, hours } from "./week-preview";

const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const LENGTHS = [30, 60, 90];

/** How much a level changes, said once so both flows explain it the same way. */
const LEVEL_HINT = "Leans the mix of your week and the difficulty of the problems you start on.";

/** Debounced autosave for one server action. A change resets the timer, so only
 *  the last value in a burst saves; the existing action still runs its own
 *  validation. Success refreshes the page so the rebuilt week, end date or focus
 *  shows without a manual reload. */
function useAutosave(action: (fd: FormData) => Promise<FormState>, delay = 600) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (fd: FormData) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setError(null);
        setNote(null);
        startTransition(async () => {
          try {
            const result = await action(fd);
            if (result.error) setError(result.error);
            else {
              setNote(result.note ?? null);
              router.refresh();
            }
          } catch {
            setError("That didn't go through. Check your connection and try again.");
          }
        });
      }, delay);
    },
    [action, delay, router],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { save, pending, error, note };
}

/** The quiet status line under an autosaved control: saving, then its error or
 *  its note (never both), and nothing once the page is simply saved. */
function AutosaveStatus({ pending, error, note }: { pending: boolean; error: string | null; note: string | null }) {
  if (pending) return <p className="text-small text-mute">Saving…</p>;
  if (error)
    return (
      <p role="alert" className="text-small text-bad">
        {error}
      </p>
    );
  if (note) return <p className="text-small text-mute">{note}</p>;
  return null;
}

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
      <WeekPreview templates={proposeTemplate(minutes.weekday, minutes.weekend, chosen)} budgets={minutes} note="adjusts as you choose" />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Starting…">Start your plan</SubmitButton>
    </form>
  );
}

/** Changing a length that is already running. `startDate` is what makes the end
 *  date truthful: `setLength` writes the length and nothing else, so the days
 *  already done keep their squares and the end date follows. */
function LengthForm({ current, minimum, startDate }: { current: number; minimum: number; startDate: string }) {
  const [custom, setCustom] = useState(!LENGTHS.includes(current));
  const [length, setLength] = useState(current);
  const { save, pending, error, note } = useAutosave((fd) => setLengthAction({}, fd));

  const pick = (days: number) => {
    setLength(days);
    setCustom(false);
    const fd = new FormData();
    fd.set("length", String(days));
    save(fd);
  };
  const typeCustom = (value: number) => {
    setLength(value);
    const fd = new FormData();
    fd.set("length", String(value));
    save(fd);
  };

  return (
    <div className="flex flex-col gap-3">
      <LengthChips length={length} custom={custom} minimum={minimum} onPick={pick} onCustom={() => setCustom(true)} />
      {custom && (
        <input
          type="number"
          min={Math.max(7, minimum)}
          max={365}
          value={length}
          onChange={(e) => typeCustom(Number(e.target.value))}
          aria-label="Days"
          className="h-10 w-24 rounded-xl border border-line-2 bg-surface px-3 text-text outline-none focus:border-cyan"
        />
      )}
      <p className="text-small text-mute">
        Day {minimum} of {length} · ends {addDays(startDate, length - 1)}. Days you have done keep their squares; the end date follows the
        length.
      </p>
      <AutosaveStatus pending={pending} error={error} note={note} />
    </div>
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
  const { save, pending, error, note } = useAutosave((fd) => setTemplatesAction({}, fd));
  // The working copy is keyed by its initial value so a rebuild resets it to the
  // rebuilt week, while this editor keeps its own save note through that remount.
  const onSave = (templates: Templates) => {
    const fd = new FormData();
    fd.set("templates", JSON.stringify(templates));
    save(fd);
  };
  return (
    <div className="flex flex-col gap-4">
      <EditorBody key={JSON.stringify(initial)} initial={initial} onSave={onSave} />
      <p className="text-small text-mute">
        Every day also has one 10 cards mission ({SLOT_MINUTES.cards} min, answered in the Feed), counted in the totals. Each day needs a
        problem, review or topic.
      </p>
      <AutosaveStatus pending={pending} error={error} note={note} />
    </div>
  );
}

/** The day-by-day working copy. Keyed by its initial value so a rebuild resets
 *  it; editing a stepper changes this component's own state and autosaves it. */
function EditorBody({ initial, onSave }: { initial: Templates; onSave: (templates: Templates) => void }) {
  const [templates, setTemplates] = useState(initial);
  const set = (day: Weekday, slot: SlotType, v: number) => {
    const next = { ...templates, [day]: { ...templates[day], [slot]: v } };
    setTemplates(next);
    onSave(next);
  };

  return (
    <>
      {/* Phones: one card per day, since four steppers across don't fit. */}
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface md:hidden">
        {WEEK_ORDER.map((d) => (
          <li key={d} className="flex flex-col gap-3 px-4 py-3.5">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-text">{DAY_NAMES[d]}</span>
              <span className="tabular text-small text-text-2">{hours(dayMinutes(templates[d]))}</span>
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
                <td className="tabular px-3 py-2.5 text-right whitespace-nowrap text-text-2">{hours(dayMinutes(templates[d]))}</td>
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
        <span className="text-small font-normal text-mute">{open ? "Hide" : "Mon–Sun by hand ›"}</span>
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
  const [chosen, setChosen] = useState<Level>(level);
  const [wd, setWd] = useState(weekday);
  const [we, setWe] = useState(weekend);
  const minutes = { weekday: Number(wd), weekend: Number(we) };

  const levelSave = useAutosave((fd) => setLevelAction({}, fd));
  const weekSave = useAutosave((fd) => setWeekAction({}, fd));

  const pickLevel = (value: string) => {
    const next = asLevel(value) ?? chosen;
    if (next === chosen) return;
    setChosen(next);
    const levelFd = new FormData();
    levelFd.set("level", next);
    levelSave.save(levelFd);
    // The level leans the mix, so the running week follows it too.
    const weekFd = new FormData();
    weekFd.set("weekday", wd);
    weekFd.set("weekend", we);
    weekFd.set("level", next);
    weekSave.save(weekFd);
  };

  const pickTime = (kind: "weekday" | "weekend") => (value: string) => {
    const nextWd = kind === "weekday" ? value : wd;
    const nextWe = kind === "weekend" ? value : we;
    if (nextWd === wd && nextWe === we) return;
    setWd(nextWd);
    setWe(nextWe);
    const fd = new FormData();
    fd.set("weekday", nextWd);
    fd.set("weekend", nextWe);
    fd.set("level", chosen);
    weekSave.save(fd);
  };

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_22rem] md:items-start md:gap-8">
      <div className="flex flex-col gap-6 md:col-start-1 md:row-start-1">
        <div className="flex flex-col gap-3">
          <ChipGroup name="level" label="Your level" options={LEVELS} defaultValue={level} value={chosen} onChange={pickLevel} />
          <p className="text-small text-mute">{LEVEL_HINT}</p>
          <AutosaveStatus pending={levelSave.pending} error={levelSave.error} note={levelSave.note} />
        </div>
        <LengthForm current={length} minimum={minimum} startDate={startDate} />
        <div className="flex flex-col gap-3">
          <ChipGroup
            name="weekday"
            label="Time on a weekday"
            options={BUDGETS}
            defaultValue={weekday}
            value={wd}
            onChange={pickTime("weekday")}
          />
          <ChipGroup
            name="weekend"
            label="Time at the weekend"
            options={BUDGETS}
            defaultValue={weekend}
            value={we}
            onChange={pickTime("weekend")}
          />
          <AutosaveStatus pending={weekSave.pending} error={weekSave.error} note={weekSave.note} />
        </div>
      </div>
      {/* Before the editor in the DOM, so the week reads straight after the
          choices on a phone; the right column on a desktop. */}
      <div className="md:col-start-2 md:row-span-2 md:row-start-1">
        <WeekPreview
          templates={proposeTemplate(minutes.weekday, minutes.weekend, chosen)}
          budgets={minutes}
          note={`ends ${addDays(startDate, length - 1)}`}
        />
      </div>
      <div className="md:col-start-1 md:row-start-2">
        <AdjustTheWeek initial={templates} />
      </div>
    </div>
  );
}

export function FocusForm({ companies, current }: { companies: string[]; current: { company: string; to: string } | null }) {
  const [company, setCompany] = useState(current?.company ?? "");
  const [weeks, setWeeks] = useState(1);
  const { save, pending, error, note } = useAutosave((fd) => setFocusAction({}, fd));

  const saveFocus = (nextCompany: string, nextWeeks: number) => {
    const fd = new FormData();
    fd.set("company", nextCompany);
    fd.set("weeks", String(nextWeeks));
    save(fd);
  };

  return (
    <div className="flex flex-col gap-4">
      {current && (
        <p className="text-small text-text-2">
          Focusing on <b className="text-text">{current.company}</b> until {current.to}.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {companies.map((c) => (
          <button
            key={c}
            type="button"
            className={chip(company === c)}
            onClick={() => {
              const next = company === c ? "" : c;
              setCompany(next);
              saveFocus(next, weeks);
            }}
          >
            {c}
          </button>
        ))}
      </div>
      <input
        value={company}
        onChange={(e) => {
          setCompany(e.target.value);
          saveFocus(e.target.value, weeks);
        }}
        placeholder="Or type a company"
        className="h-10 rounded-xl border border-line-2 bg-surface px-3.5 text-text outline-none focus:border-cyan"
      />
      <div className="flex flex-wrap gap-2">
        {[1, 2, 4].map((w) => (
          <button
            key={w}
            type="button"
            className={chip(weeks === w)}
            onClick={() => {
              setWeeks(w);
              if (company) saveFocus(company, w);
            }}
          >
            {w === 1 ? "1 week" : `${w} weeks`}
          </button>
        ))}
      </div>
      <AutosaveStatus pending={pending} error={error} note={note} />
    </div>
  );
}
