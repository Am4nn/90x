"use client";

import { useSyncExternalStore } from "react";
import { zoneLabel } from "@/lib/zones";

// The time zone picker in Set up and Settings: a native select (the phone's own
// picker, type-to-jump on desktop). `zones` comes from the server, so the list
// the server rendered is the list the browser hydrates.

const subscribe = () => () => {};
const deviceZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

/** The device's zone, or null on the server and before hydration (so no mismatch). */
export function useDeviceZone(): string | null {
  return useSyncExternalStore(subscribe, deviceZone, () => null);
}

export function TimezoneSelect({
  zones,
  value,
  onChange,
  name,
  id,
  className = "",
}: {
  zones: string[];
  value: string;
  onChange: (zone: string) => void;
  name?: string;
  id?: string;
  className?: string;
}) {
  // A zone the server's list lacks (a device alias like Asia/Calcutta) is still offered.
  const options = zones.includes(value) ? zones : [value, ...zones];
  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-11 min-w-0 rounded-xl border border-line-2 bg-surface px-3 text-text outline-none focus:border-cyan ${className}`}
    >
      {options.map((z) => (
        <option key={z} value={z}>
          {zoneLabel(z)}
        </option>
      ))}
    </select>
  );
}
