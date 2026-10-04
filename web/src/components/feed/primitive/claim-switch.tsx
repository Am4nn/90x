"use client";

export type SwitchTone = "idle" | "selected" | "right" | "wrong" | "neutral";

const THUMB: Record<SwitchTone, string> = {
  idle: "opacity-0",
  selected: "border-cyan bg-cyan-bg",
  right: "border-ok bg-surface",
  wrong: "border-bad bg-surface",
  neutral: "border-line-2 bg-surface-2",
};

const LABEL: Record<SwitchTone, string> = {
  idle: "text-text-2",
  selected: "text-cyan",
  right: "text-ok",
  wrong: "text-bad",
  neutral: "text-text-2",
};

/** The True / False pill: a thumb slides to the chosen side. Tapping the chosen side
 *  again clears it. Read-only (no `onSet`) it is the frozen copy a result shows. */
export function ClaimSwitch({
  label,
  value,
  tone,
  onSet,
  disabled,
}: {
  label: string;
  value: 0 | 1 | null;
  tone: SwitchTone;
  onSet?: (next: 0 | 1 | null) => void;
  disabled?: boolean;
}) {
  const chosen = value === 1 ? "True" : value === 0 ? "False" : "Neither";
  return (
    <div
      role="group"
      aria-label={`${label}: ${onSet ? "true or false" : chosen}`}
      className="relative h-11 w-33 shrink-0 rounded-full border border-line-2 bg-background"
    >
      <div className="absolute inset-0.75" aria-hidden>
        <span
          className={`absolute inset-y-0 left-0 w-1/2 rounded-full border transition-transform duration-200 ease-out ${THUMB[value === null ? "idle" : tone]} ${
            value === 0 ? "translate-x-full" : ""
          }`}
        />
      </div>
      <div className="relative grid h-full grid-cols-2 p-0.75">
        {([1, 0] as const).map((side) => (
          <button
            key={side}
            type="button"
            disabled={disabled || !onSet}
            aria-pressed={value === side}
            onClick={() => onSet?.(value === side ? null : side)}
            className={`rounded-full text-small font-bold ${value === side ? LABEL[tone] : value === null || !onSet ? "text-text-2" : "text-mute"} disabled:cursor-default`}
          >
            {side === 1 ? "True" : "False"}
          </button>
        ))}
      </div>
    </div>
  );
}
