"use client";

import { Select } from "@base-ui/react/select";
import { DOT_FILL } from "@/components/library/palette";
import type { PatternNode } from "@/lib/library/queries";

// The selected pattern's name over its problem list is also a dropdown of every pattern,
// so a pattern can be picked without the map. It moves the same
// selection the map does.

export function PatternPicker({
  patterns,
  selected,
  onSelect,
}: {
  patterns: PatternNode[];
  selected: PatternNode;
  onSelect: (slug: string) => void;
}) {
  return (
    <Select.Root
      items={patterns.map((p) => ({ value: p.slug, label: p.name }))}
      value={selected.slug}
      onValueChange={(v) => {
        if (typeof v === "string") onSelect(v);
      }}
    >
      <Select.Trigger
        aria-label={`Pattern: ${selected.name}`}
        className="group -my-1.5 -ml-2 flex min-h-9 min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-text hover:bg-surface-2 data-[popup-open]:bg-surface-2"
      >
        <span className="truncate font-display text-heading font-semibold">{selected.name}</span>
        <svg
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
          className="size-3.5 shrink-0 text-mute transition-transform duration-200 group-data-[popup-open]:rotate-180"
        >
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner side="bottom" align="start" sideOffset={10} alignItemWithTrigger={false} className="z-30">
          <Select.Popup className="w-75 max-w-(--available-width) rounded-xl border border-line-2 bg-surface p-1.5 shadow-[0_18px_40px_color-mix(in_srgb,black_55%,transparent)] outline-none">
            <Select.List className="flex max-h-95 flex-col overflow-y-auto">
              {patterns.map((p) => (
                <Select.Item
                  key={p.slug}
                  value={p.slug}
                  className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 text-body leading-tight font-semibold text-text outline-none data-[highlighted]:bg-surface-2 data-[selected]:bg-cyan-bg data-[selected]:text-cyan"
                >
                  <span aria-hidden className={`size-1.75 shrink-0 rounded-full ${DOT_FILL[p.state]}`} />
                  <Select.ItemText className="min-w-0 flex-1">{p.name}</Select.ItemText>
                  <span className="tabular shrink-0 text-tag font-medium text-mute">
                    {p.solved}/{p.total}
                  </span>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
