"use client";

import { Popover } from "@base-ui/react/popover";
import { CheckIcon } from "@/components/icons";
import { SPEEDS, type Speed } from "@/lib/audio/rules";

/** One pill showing the current speed; tap opens the six choices. */
export function SpeedPill({ rate, onChange }: { rate: Speed; onChange: (r: Speed) => void }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`Speed, ${rate}x`}
        className="inline-flex h-9 items-center rounded-lg border border-line-2 bg-surface-2 px-3.5 font-mono text-small text-text data-[popup-open]:border-cyan"
      >
        {rate}x
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={8} collisionPadding={16} className="z-50">
          <Popover.Popup
            aria-label="Speed"
            className="flex w-45 flex-col rounded-xl border border-line-2 bg-surface-2 p-1 shadow-2xl outline-none"
          >
            {SPEEDS.map((s) => (
              <Popover.Close
                key={s}
                onClick={() => onChange(s)}
                aria-pressed={s === rate}
                className={`flex h-11 w-full items-center justify-between rounded-lg px-3.5 text-left font-mono text-small hover:bg-surface ${s === rate ? "text-cyan" : "text-text-2"}`}
              >
                {s}x{s === rate && <CheckIcon className="size-4" />}
              </Popover.Close>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
