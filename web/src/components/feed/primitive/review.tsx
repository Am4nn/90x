import type { Answer } from "@/lib/feed/grade";
import type { CardOptions } from "@/lib/feed/options";
import type { CorrectAnswer } from "@/lib/feed/view";

/**
 * The question again, after it has been answered, marked up in place.
 *
 * A reader who has just answered wants one thing first: what was right, what
 * they put, and where those differ. Replacing the card with prose makes them
 * rebuild the question from memory to read the answer. Only the chosen shape
 * ever did this - every other primitive dropped its layout the moment it was
 * answered and explained itself in a paragraph instead.
 *
 * So each primitive is redrawn in its own shape, read-only, with the same
 * borders and spacing it had while it was being answered: a tick on what was
 * right, a cross on what the reader put that was not.
 */

const OK = "border-ok/50 bg-ok/5 text-text";
const BAD = "border-bad/50 bg-bad/5 text-text-2";
const IDLE = "border-line text-mute";
const CELL = "flex items-start gap-3 rounded-xl border px-4 py-3 text-body";

/** The tick, cross, or nothing that goes at the head of a row. */
function Mark({ state }: { state: "ok" | "bad" | "idle" }) {
  if (state === "idle") {
    return (
      <span className="text-mute" aria-hidden>
        •
      </span>
    );
  }
  return (
    <span
      className={state === "ok" ? "font-semibold text-ok" : "font-semibold text-bad"}
      role="img"
      aria-label={state === "ok" ? "Correct" : "Wrong"}
    >
      {state === "ok" ? "✓" : "✕"}
    </span>
  );
}

function Legend({ children }: { children: string }) {
  return <h2 className="text-small font-semibold text-mute">{children}</h2>;
}

/** pick_one, mcq, claim_grid, tap_in_place: one list, some of it chosen. */
function ChosenReview({ items, picked, correct }: { items: string[]; picked: number[]; correct: number[] }) {
  const chose = new Set(picked);
  const truth = new Set(correct);
  return (
    <ul className="flex flex-col gap-2" aria-label="Your answer">
      {items.map((item, index) => {
        // Right and chosen, or right and missed, both read as "this was right";
        // the cross is kept for what the reader put that was not.
        const state = truth.has(index) ? "ok" : chose.has(index) ? "bad" : "idle";
        return (
          <li key={index} className={`${CELL} ${state === "ok" ? OK : state === "bad" ? BAD : IDLE}`}>
            <Mark state={state} />
            <span className="flex-1">{item}</span>
            {chose.has(index) && <span className="shrink-0 text-small text-mute">you</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** order and assemble: the reader's sequence, with the rules it broke named. */
function OrderedReview({ items, order, constraints }: { items: string[]; order: number[]; constraints: [number, number][] }) {
  // The card stores the constraints it claims, not one blessed sequence, so
  // every genuinely correct order passes. The review says the same thing: it
  // marks the pairs this order got the wrong way round, and nothing else.
  const at = new Map(order.map((item, position) => [item, position]));
  const broken = constraints.filter(([before, after]) => (at.get(before) ?? -1) > (at.get(after) ?? -1));
  const inBroken = new Set(broken.flat());
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2" aria-label="Your order">
        {order.map((item, position) => {
          const state = inBroken.has(item) ? "bad" : "ok";
          return (
            <li key={position} className={`${CELL} ${state === "ok" ? OK : BAD}`}>
              <span className="tabular w-5 shrink-0 text-mute">{position + 1}</span>
              <Mark state={state} />
              <span className="flex-1">{items[item] ?? ""}</span>
            </li>
          );
        })}
      </ol>
      {broken.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {broken.map(([before, after], index) => (
            <li key={index} className="text-small text-text-2">
              <span className="text-bad">✕</span> “{items[before] ?? ""}” has to come before “{items[after] ?? ""}”
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** match: each term with what the reader paired it to, and the right one beside it. */
function MatchReview({
  left,
  right,
  pairs,
  correct,
}: {
  left: string[];
  right: string[];
  pairs: [number, number][];
  correct: [number, number][];
}) {
  const mine = new Map(pairs);
  const truth = new Map(correct);
  return (
    <ul className="flex flex-col gap-2" aria-label="Your pairs">
      {left.map((term, index) => {
        const chose = mine.get(index);
        const want = truth.get(index);
        const ok = chose !== undefined && chose === want;
        return (
          <li key={index} className={`${CELL} flex-col items-stretch gap-1.5 sm:flex-row sm:items-start ${ok ? OK : BAD}`}>
            <span className="flex items-start gap-3 sm:flex-1">
              <Mark state={ok ? "ok" : "bad"} />
              <span>{term}</span>
            </span>
            <span className="flex flex-col gap-0.5 pl-7 sm:pl-0 sm:text-right">
              <span className={ok ? "text-text" : "text-bad"}>{chose === undefined ? "— not paired" : (right[chose] ?? "")}</span>
              {!ok && want !== undefined && <span className="text-small text-ok">{right[want] ?? ""}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** bucket: the columns again, each holding what the reader put in it. */
function BucketReview({
  items,
  columns,
  pairs,
  correct,
}: {
  items: string[];
  columns: string[];
  pairs: [number, number][];
  correct: [number, number][];
}) {
  const mine = new Map(pairs);
  const truth = new Map(correct);
  return (
    <div role="group" className="grid gap-3 sm:grid-cols-2" aria-label="Your buckets">
      {columns.map((column, columnIndex) => {
        const inside = items.map((_, index) => index).filter((index) => mine.get(index) === columnIndex);
        return (
          <section key={columnIndex} className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
            <h3 className="text-small font-semibold text-text-2">{column}</h3>
            {inside.length === 0 && <p className="text-small text-mute">nothing</p>}
            {inside.map((index) => {
              const ok = truth.get(index) === columnIndex;
              return (
                <p key={index} className="flex items-start gap-2 text-small">
                  <Mark state={ok ? "ok" : "bad"} />
                  <span className={ok ? "text-text" : "text-text-2"}>
                    {items[index] ?? ""}
                    {!ok && <span className="text-ok"> → {columns[truth.get(index) ?? 0] ?? ""}</span>}
                  </span>
                </p>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

const cellKey = (row: number, column: number) => `${row}:${column}`;

/** grid_toggle: the same grid, with each cell marked. */
function GridReview({
  rows,
  columns,
  pairs,
  correct,
}: {
  rows: string[];
  columns: string[];
  pairs: [number, number][];
  correct: [number, number][];
}) {
  const mine = new Set(pairs.map(([row, column]) => cellKey(row, column)));
  const truth = new Set(correct.map(([row, column]) => cellKey(row, column)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-small" aria-label="Your grid">
        <thead>
          <tr>
            <th scope="col" className="px-2 py-2">
              <span className="sr-only">Row</span>
            </th>
            {columns.map((column, index) => (
              <th key={index} className="px-2 py-2 text-left font-semibold text-text-2">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <th scope="row" className="py-2 pr-3 text-left font-normal text-text-2">
                {row}
              </th>
              {columns.map((_, columnIndex) => {
                const on = mine.has(cellKey(rowIndex, columnIndex));
                const want = truth.has(cellKey(rowIndex, columnIndex));
                return (
                  <td key={columnIndex} className="px-2 py-2">
                    <span
                      className={`flex min-h-9 min-w-9 items-center justify-center rounded-lg border ${
                        on === want ? (on ? OK : IDLE) : BAD
                      }`}
                    >
                      {on === want ? (
                        on ? (
                          <span className="text-ok">✓</span>
                        ) : (
                          <span className="text-mute" aria-hidden>
                            ·
                          </span>
                        )
                      ) : (
                        // The two ways to be wrong, told apart: on where it should
                        // be off, and off where it should be on.
                        <span className="text-bad">{on ? "✕" : "○"}</span>
                      )}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NumberReview({ value, correct, tolerance }: { value: number; correct: number; tolerance: number }) {
  const ok = Math.abs(value - correct) <= tolerance;
  return (
    <div role="group" aria-label="Your answer" className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span className={`${CELL} ${ok ? OK : BAD}`}>
        <Mark state={ok ? "ok" : "bad"} />
        <span className="tabular font-display text-heading font-semibold">{value}</span>
      </span>
      {!ok && (
        <span className="text-small text-text-2">
          the answer is <span className="tabular font-semibold text-ok">{correct}</span>
          {tolerance > 0 && <span className="text-mute"> ± {tolerance}</span>}
        </span>
      )}
    </div>
  );
}

export function AnswerReview({
  content,
  submitted,
  correct,
}: {
  content: CardOptions | null;
  submitted: Answer | null;
  correct: CorrectAnswer | null;
}) {
  if (!correct || !submitted) return null;

  const body = (() => {
    if (correct.shape === "number" && submitted.shape === "number") {
      return <NumberReview value={submitted.value} correct={correct.value} tolerance={correct.tolerance} />;
    }
    if (!content) return null;
    if (correct.shape === "chosen" && submitted.shape === "chosen" && content.shape === "list") {
      return <ChosenReview items={content.items} picked={submitted.picked} correct={correct.picked} />;
    }
    if (correct.shape === "ordered" && submitted.shape === "ordered") {
      const items = content.shape === "list" ? content.items : content.shape === "assemble" ? content.tokens : null;
      return items && <OrderedReview items={items} order={submitted.order} constraints={correct.constraints} />;
    }
    if (correct.shape === "mapping" && submitted.shape === "mapping") {
      if (content.shape === "match") {
        return <MatchReview left={content.left} right={content.right} pairs={submitted.pairs} correct={correct.pairs} />;
      }
      if (content.shape === "bucket") {
        return <BucketReview items={content.items} columns={content.columns} pairs={submitted.pairs} correct={correct.pairs} />;
      }
      if (content.shape === "grid") {
        return <GridReview rows={content.rows} columns={content.columns} pairs={submitted.pairs} correct={correct.pairs} />;
      }
    }
    return null;
  })();

  if (!body) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <Legend>Your answer</Legend>
      {body}
    </section>
  );
}
