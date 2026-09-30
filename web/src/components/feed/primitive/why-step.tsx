"use client";

/** The why-step: a second screen on the same card, shown only after a correct
 *  main answer. The reader picks the reason; both the answer and the reason must
 *  be right, or the card is marked wrong. The stepper is two dots, not a page,
 *  so the card still reads as one question with one mark. */
export function WhyStep({
  options,
  pending,
  busy,
  onSubmit,
}: {
  options: string[];
  pending: boolean;
  busy: string | null;
  onSubmit: (why: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5 text-small font-semibold">
        <span className="flex items-center gap-1.5 text-ok">
          <span className="size-2 rounded-full bg-cyan" aria-hidden />
          Answer
        </span>
        <span className="h-px w-6 bg-line-2" aria-hidden />
        <span className="flex items-center gap-1.5 text-text-2">
          <span className="size-2 rounded-full bg-cyan" aria-hidden />
          Reason
        </span>
      </div>

      <p className="text-body font-semibold text-text">Right. Now, why is that the answer?</p>

      <ul className="flex flex-col gap-2" aria-label="Reason">
        {options.map((reason, index) => (
          <li key={index}>
            <button
              type="button"
              disabled={pending}
              aria-busy={busy === "check" || undefined}
              onClick={() => onSubmit(index)}
              className="flex w-full items-start gap-3 rounded-xl border border-line-2 px-4 py-3 text-left text-text hover:border-cyan disabled:opacity-60"
            >
              <span className="font-display font-semibold text-mute">{String.fromCharCode(65 + index)}</span>
              <span>{reason}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
