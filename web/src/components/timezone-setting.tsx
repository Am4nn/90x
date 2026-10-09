"use client";

import { useId, useState, useTransition } from "react";
import { saveTimezone } from "@/app/actions/timezone";
import { button } from "@/components/button-styles";
import { Busy } from "@/components/form";
import { TimezoneSelect } from "@/components/timezone-select";
import { zoneLabel } from "@/lib/zones";

// Settings → Account → Timezone. Set up picks the device's zone; after that it only
// changes here, by hand.

export function TimezoneSetting({ timezone: initial, zones }: { timezone: string; zones: string[] }) {
  const id = useId();
  const [timezone, setTimezone] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const r = await saveTimezone(value).catch(() => null);
      if (!r) return setError("Couldn't reach 90x. Check your connection and try again.");
      if ("error" in r) return setError(r.error);
      setTimezone(r.timezone);
      setEditing(false);
      setSaved(true);
    });
  }

  return (
    <li className="flex flex-col gap-3 border-t border-line px-4 py-3.5 first:border-0" data-testid="timezone-setting">
      <div className="flex items-center justify-between gap-4">
        <span className="text-small text-text-2">Timezone</span>
        {!editing && (
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate text-small font-semibold text-text">{zoneLabel(timezone)}</span>
            <button
              type="button"
              onClick={() => {
                setValue(timezone);
                setError(null);
                setSaved(false);
                setEditing(true);
              }}
              className={`${button({ variant: "ghost", size: "sm" })} -mr-2`}
            >
              Edit
            </button>
          </span>
        )}
      </div>

      {editing && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label htmlFor={id} className="sr-only">
            Timezone
          </label>
          <TimezoneSelect id={id} zones={zones} value={value} onChange={setValue} className="h-10 w-full" />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              aria-busy={pending || undefined}
              className={button({ variant: "primary", size: "sm" })}
            >
              <Busy busy={pending}>{pending ? "Saving…" : "Save"}</Busy>
            </button>
            <button type="button" onClick={() => setEditing(false)} disabled={pending} className={button({ variant: "ghost", size: "sm" })}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      )}
      {!error && saved && (
        <p role="status" className="text-small text-mute">
          Saved. Your days now start at midnight in this zone.
        </p>
      )}
    </li>
  );
}
