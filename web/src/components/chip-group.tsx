"use client";

import { useState } from "react";

type Option = { value: string; label: string };

/** Single-choice chips with a hidden input, for short option lists where a
 *  native <select> would render differently on every browser. */
export function ChipGroup({ name, label, options, defaultValue, error }: {
  name: string;
  label: string;
  options: readonly Option[];
  defaultValue: string;
  error?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-2.5 text-small font-semibold text-text-2">{label}</legend>
      <input type="hidden" name={name} value={value} />
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => setValue(o.value)}
              className={`h-10 rounded-full border px-4 text-small font-semibold transition-colors ${on ? "border-cyan bg-cyan-bg text-cyan" : "border-line-2 text-text-2 hover:border-mute hover:text-text"}`}>
              {o.label}
            </button>
          );
        })}
      </div>
      {error && <span className="text-small text-bad">{error}</span>}
    </fieldset>
  );
}

/** On/off switch that submits "on" like a checkbox. */
export function Switch({ name, label, defaultChecked = false }: { name: string; label: string; defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line-2 bg-surface px-4 py-3">
      <span className="text-text-2">{label}</span>
      <input type="checkbox" name={name} checked={on} onChange={(e) => setOn(e.target.checked)} className="peer sr-only" />
      <span aria-hidden
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan ${on ? "bg-cyan" : "bg-line-2"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full transition-transform ${on ? "translate-x-5 bg-on-cyan" : "translate-x-0.5 bg-text-2"}`} />
      </span>
    </label>
  );
}
