// A small reader for 5-field cron lines (minute hour day-of-month month day-of-week), in UTC, as QStash
// and GitHub Actions run them. Enough for "when is the next run" and "when was the last one due" on the
// admin page: numbers, `*`, lists, ranges and steps. No names (MON, JAN) and no seconds.

type Cron = {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  domAny: boolean;
  dowAny: boolean;
};

const FIELDS = [
  ["minute", 0, 59],
  ["hour", 0, 23],
  ["day of month", 1, 31],
  ["month", 1, 12],
  ["day of week", 0, 7],
] as const;

function field(text: string, [name, min, max]: (typeof FIELDS)[number]): Set<number> {
  const out = new Set<number>();
  for (const part of text.split(",")) {
    const [range = "", stepText] = part.split("/");
    const step = stepText === undefined ? 1 : Number(stepText);
    let lo: number = min;
    let hi: number = max;
    if (range !== "*") {
      const [a, b] = range.split("-");
      lo = Number(a);
      hi = b === undefined ? (stepText === undefined ? lo : max) : Number(b);
    }
    const ok = [lo, hi, step].every((n) => Number.isInteger(n)) && lo >= min && hi <= max && lo <= hi && step >= 1;
    if (!ok || !/^(\*|\d+(-\d+)?)(\/\d+)?$/.test(part)) throw new Error(`cron ${name}: cannot read "${part}"`);
    for (let n = lo; n <= hi; n += step) out.add(n);
  }
  return out;
}

export function parseCron(expr: string): Cron {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`cron "${expr}": want 5 fields, got ${parts.length}`);
  const [minute, hour, dom, month, dow] = FIELDS.map((f, i) => field(parts[i]!, f)) as [
    Set<number>,
    Set<number>,
    Set<number>,
    Set<number>,
    Set<number>,
  ];
  if (dow.has(7)) dow.add(0);
  return { minute, hour, dom, month, dow, domAny: parts[2] === "*", dowAny: parts[4] === "*" };
}

// Cron's own rule: when both day fields are restricted, a day matching either one runs.
function dayMatches(c: Cron, d: Date): boolean {
  const byDom = c.dom.has(d.getUTCDate());
  const byDow = c.dow.has(d.getUTCDay());
  if (c.domAny || c.dowAny) return (c.domAny || byDom) && (c.dowAny || byDow);
  return byDom || byDow;
}

// Walk from `start` (a whole minute) forwards or backwards, skipping a month, day or hour at a time when
// that field can't match. Five years of minutes is far more than any real line needs.
function scan(expr: string, start: Date, dir: 1 | -1): Date {
  const c = parseCron(expr);
  const d = new Date(start);
  for (let i = 0; i < 200_000; i++) {
    if (!c.month.has(d.getUTCMonth() + 1)) {
      if (dir > 0) d.setUTCMonth(d.getUTCMonth() + 1, 1);
      else d.setUTCDate(0);
      d.setUTCHours(dir > 0 ? 0 : 23, dir > 0 ? 0 : 59);
    } else if (!dayMatches(c, d)) {
      d.setUTCDate(d.getUTCDate() + dir);
      d.setUTCHours(dir > 0 ? 0 : 23, dir > 0 ? 0 : 59);
    } else if (!c.hour.has(d.getUTCHours())) {
      d.setUTCHours(d.getUTCHours() + dir, dir > 0 ? 0 : 59);
    } else if (!c.minute.has(d.getUTCMinutes())) {
      d.setUTCMinutes(d.getUTCMinutes() + dir);
    } else {
      return d;
    }
  }
  throw new Error(`cron "${expr}": no run found`);
}

const floorMinute = (t: Date) => new Date(Math.floor(t.getTime() / 60_000) * 60_000);

/** The first run strictly after `after`. */
export function nextRun(expr: string, after: Date): Date {
  return scan(expr, new Date(floorMinute(after).getTime() + 60_000), 1);
}

/** The last run at or before `at`. */
export function previousRun(expr: string, at: Date): Date {
  return scan(expr, floorMinute(at), -1);
}
