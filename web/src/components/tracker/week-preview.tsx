import { DAY_NAMES, type Weekday } from "@/lib/tracker/dates";
import { SLOT_TYPES, type Slots, type Templates, templateMinutes } from "@/lib/tracker/template";

// The live week: two rows, not seven, because the proposal is the same shape on
// every weekday and on both weekend days. Pure and presentational, so the Plan
// page and Set up can both draw it and it recomputes on every keystroke.

const GROUPS: { name: string; range: string; days: [Weekday, ...Weekday[]] }[] = [
  { name: "Weekday", range: `${DAY_NAMES[1]}–${DAY_NAMES[5]}`, days: [1, 2, 3, 4, 5] },
  { name: "Weekend", range: `${DAY_NAMES[6]}–${DAY_NAMES[0]}`, days: [6, 0] },
];

/** The noun for a slot count. `SLOT_LABEL` is the plural heading form. */
const SLOT_WORD: Record<(typeof SLOT_TYPES)[number], [one: string, many: string]> = {
  new_problem: ["problem", "problems"],
  review: ["review", "reviews"],
  topic: ["topic", "topics"],
  cards: ["card set", "card sets"],
};

/** "1 problem · 3 reviews · 1 card set", skipping the slots a day has none of. */
function summary(slots: Slots): string {
  return SLOT_TYPES.filter((type) => slots[type] > 0)
    .map((type) => `${slots[type]} ${SLOT_WORD[type][slots[type] === 1 ? 0 : 1]}`)
    .join(" · ");
}

/** "1h 50m", the same shape the day-by-day editor uses for its totals. */
export function hours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

/** What one group of days looks like. The days inside a group are normally the
 *  same; a hand-edited week can differ, and then the row says so instead of
 *  quietly showing one day as if it were all of them. */
function group(templates: Templates, days: [Weekday, ...Weekday[]]) {
  const [first, ...rest] = days;
  const slots = templates[first];
  const uniform = rest.every((day) => SLOT_TYPES.every((type) => templates[day][type] === slots[type]));
  return { slots, uniform };
}

export function WeekPreview({
  templates,
  budgets,
  note,
}: {
  templates: Templates;
  /** The exact daily budgets the times were chosen from. */
  budgets: { weekday: number; weekend: number };
  note?: string;
}) {
  return (
    <div role="group" aria-label="Your week" className="flex flex-col gap-3 rounded-xl border border-line-2 bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-heading font-semibold">Your week</h3>
        {note && <span className="text-small text-mute">{note}</span>}
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface-2">
        {GROUPS.map(({ name, range, days }) => {
          const { slots, uniform } = group(templates, days);
          const missions = SLOT_TYPES.reduce((n, type) => n + slots[type], 0);
          return (
            <li key={name} className="flex items-baseline justify-between gap-3 px-4 py-3">
              <span className="flex flex-col">
                <span className="font-semibold text-text">{name}</span>
                <span className="text-small text-text-2">
                  {range} · {summary(slots)}
                  {uniform ? "" : " · days differ"}
                </span>
              </span>
              <span className="tabular shrink-0 text-small font-semibold text-text-2">
                ~{hours(templateMinutes(slots))} · {missions} missions
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-small text-mute">
        {budgets.weekday} min on a weekday, {budgets.weekend} min at the weekend.
      </p>
    </div>
  );
}
