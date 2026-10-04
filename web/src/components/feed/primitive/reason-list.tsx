import { Eyebrow } from "./hint";
import { MarkLine } from "./marks";
import { ROW_TONE, type RowTone } from "./option-row";

/** "Now the reason": the why-step's reasons as tiles under the options. Tappable while asking
 *  (`onPick`), frozen and marked once the card is answered (`marks`). */
export function ReasonList({
  reasons,
  tone,
  onPick,
  marks,
}: {
  reasons: string[];
  tone: (index: number) => RowTone;
  onPick?: (index: number) => void;
  marks?: (index: number) => "Correct" | "You chose" | null;
}) {
  return (
    <section className="mt-3 flex flex-col gap-2 border-t border-line pt-5">
      <Eyebrow>Now the reason</Eyebrow>
      <p className="mb-1 text-heading leading-6 font-semibold text-text">Why is that the answer?</p>
      <ul className="flex flex-col gap-2" aria-label="Reason">
        {reasons.map((reason, index) => {
          const mark = marks?.(index) ?? null;
          return (
            <li key={index}>
              <button
                type="button"
                disabled={!onPick}
                aria-pressed={tone(index) === "sel"}
                onClick={() => onPick?.(index)}
                className={`flex min-h-12 w-full flex-col items-start gap-2 rounded-lg border px-3.5 py-3 text-left text-body disabled:cursor-default ${ROW_TONE[tone(index)]}`}
              >
                <span className="text-tag font-bold tracking-label text-text-2">Reason {index + 1}</span>
                <span className="text-pretty">{reason}</span>
                {mark && <MarkLine ok={mark === "Correct"}>{mark}</MarkLine>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
