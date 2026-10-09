// Time zones for the pickers in Set up and Settings. The list comes from the
// runtime's own tz database (Intl), so every name in it is one Intl accepts.

const FALLBACK = ["UTC", "Asia/Kolkata", "Europe/London", "America/New_York", "America/Los_Angeles"];

/** Every IANA zone the runtime knows, sorted, with `keep` added when it isn't
 *  there (an alias like Asia/Calcutta, or a saved value from another runtime). */
export function timeZones(keep?: string | null): string[] {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = FALLBACK;
  }
  const all = new Set(zones.includes("UTC") ? zones : ["UTC", ...zones]);
  if (keep) all.add(keep);
  return [...all].toSorted((a, b) => a.localeCompare(b));
}

/** The zone's UTC offset right now, as "GMT+5:30" ("GMT" for UTC itself). */
export function zoneOffset(zone: string, at = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName");
    // Some runtimes write UTC itself as "GMT+0".
    return part?.value === "GMT+0" ? "GMT" : (part?.value ?? "");
  } catch {
    return "";
  }
}

// A picker labels ~420 zones on every render; an offset only changes at a DST switch,
// so a label is kept for the hour it was made in.
const labels = new Map<string, string>();

/** "Asia/Kolkata · GMT+5:30", the way the pickers list a zone. */
export function zoneLabel(zone: string, at = new Date()): string {
  const key = `${zone}@${at.toISOString().slice(0, 13)}`;
  const hit = labels.get(key);
  if (hit) return hit;
  const offset = zoneOffset(zone, at);
  const name = zone.replaceAll("_", " ");
  const label = offset ? `${name} · ${offset}` : name;
  if (labels.size > 2000) labels.clear();
  labels.set(key, label);
  return label;
}

/** Whether Intl accepts the name. Postgres checks it again (profiles_timezone_valid). */
export function isTimeZone(zone: string): boolean {
  try {
    return Boolean(new Intl.DateTimeFormat("en", { timeZone: zone }));
  } catch {
    return false;
  }
}
