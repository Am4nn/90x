import { type Weekday } from "@/lib/tracker/dates";
import { dayMinutes, SLOT_MINUTES, SLOT_TYPES, type SlotType, type Slots, type Templates } from "@/lib/tracker/template";

// The live week: two rows, not seven, because the proposal is the same shape on
// every weekday and on both weekend days. Pure and presentational, so the Plan
// page and Set up can both draw it and it recomputes on every keystroke.

const GROUPS: { name: string; days: [Weekday, ...Weekday[]] }[] = [
  { name: "Weekday", days: [1, 2, 3, 4, 5] },
  { name: "Weekend", days: [6, 0] },
];

/** The noun for a slot count. `SLOT_LABEL` is the plural heading form. */
const SLOT_WORD: Record<SlotType, [one: string, many: string]> = {
  new_problem: ["problem", "problems"],
  review: ["review", "reviews"],
  topic: ["topic", "topics"],
};

/** "1 problem · 3 reviews · 1 topic", skipping the slots a day has none of. */
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
    <div role="group" aria-label="Your week" className="flex flex-col gap-3 rounded-xl border border-line-2 bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-heading font-semibold">Your week</h3>
        {note && <span className="text-small text-mute">{note}</span>}
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-background">
        {GROUPS.map(({ name, days }) => {
          const { slots, uniform } = group(templates, days);
          return (
            <li key={name} className="flex items-baseline justify-between gap-3 px-4 py-3">
              <span className="flex flex-col">
                <span className="font-semibold text-text">{name}</span>
                <span className="text-small text-text-2">
                  {summary(slots)}
                  {uniform ? "" : " · days differ"}
                </span>
              </span>
              <span className="tabular shrink-0 font-semibold text-text-2">~{hours(dayMinutes(slots))}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-small text-mute">
        {budgets.weekday} min on a weekday, {budgets.weekend} min at the weekend. Every day also has 10 cards ({SLOT_MINUTES.cards} min),
        counted in the times.
      </p>
    </div>
  );
}
