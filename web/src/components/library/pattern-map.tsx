"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAP_BG, RING } from "@/components/library/palette";
import { useIsPhone } from "@/components/use-is-phone";
import { ancestors, edgePath, layoutPatternMap, MAP_WINDOW, type MapLink, patternTiers, windowShift } from "@/lib/library/map-layout";
import type { PatternNode } from "@/lib/library/queries";

// The DSA pattern map. Each pattern is a dot with a progress ring;
// tapping one selects it, which lights the path that leads there and dims what is unrelated.
// The map fits its box (no sideways scroll); on a phone it shows a 340px window that follows
// the selection, with "Show full map" to see all of it.

const RADIUS = 11.5;
const CIRC = 2 * Math.PI * RADIUS;

function Node({
  p,
  x,
  y,
  w,
  selected,
  related,
  onSelect,
}: {
  p: PatternNode;
  x: number;
  y: number;
  w: number;
  selected: boolean;
  related: boolean;
  onSelect: (slug: string) => void;
}) {
  const pct = p.total ? p.solved / p.total : 0;
  const fade = related ? "opacity-100" : "opacity-50";
  return (
    <button
      type="button"
      onClick={() => onSelect(p.slug)}
      aria-pressed={selected}
      aria-label={`${p.name}: ${p.solved} of ${p.total} solved`}
      className="absolute flex cursor-pointer flex-col items-center gap-1.75"
      style={{ left: Math.round(x - w / 2), top: y, width: w }}
    >
      <span
        className={`relative size-7 shrink-0 rounded-full transition-shadow duration-250 ${
          selected
            ? "bg-cyan-bg shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-cyan)_16%,transparent),0_0_18px_color-mix(in_srgb,var(--color-cyan)_35%,transparent)]"
            : MAP_BG
        }`}
      >
        <svg viewBox="0 0 28 28" aria-hidden className={`absolute inset-0 size-7 -rotate-90 transition-opacity duration-250 ${fade}`}>
          <circle
            cx="14"
            cy="14"
            r={RADIUS}
            fill="none"
            strokeWidth="2"
            className={selected ? "stroke-[color-mix(in_srgb,var(--color-surface-2)_70%,var(--color-cyan))]" : "stroke-line-2"}
          />
          <circle
            cx="14"
            cy="14"
            r={RADIUS}
            fill="none"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray={`${(CIRC * pct).toFixed(1)} ${CIRC.toFixed(1)}`}
            // A 0-length round cap would paint a dot.
            className={pct === 0 ? "stroke-transparent" : RING[p.state]}
          />
        </svg>
      </span>
      <span
        className={`max-w-full text-center text-tag leading-tight text-balance transition-[color,opacity] duration-250 [text-shadow:0_0_4px_var(--map-bg),0_0_4px_var(--map-bg),0_0_8px_var(--map-bg),0_0_12px_var(--map-bg)] ${fade} ${
          selected
            ? "font-bold text-cyan"
            : p.state === "untouched"
              ? "font-semibold text-[color-mix(in_srgb,var(--color-text)_15%,var(--color-mute))]"
              : "font-semibold text-text"
        }`}
      >
        {p.name}
      </span>
    </button>
  );
}

export function PatternMap({
  patterns,
  links,
  selected,
  onSelect,
}: {
  patterns: PatternNode[];
  links: MapLink[];
  selected: string;
  onSelect: (slug: string) => void;
}) {
  const phone = useIsPhone();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const slugs = useMemo(() => patterns.map((p) => p.slug), [patterns]);
  const tiers = useMemo(() => patternTiers(slugs, links), [slugs, links]);
  const layout = useMemo(() => (width ? layoutPatternMap(slugs, tiers, width, phone) : null), [slugs, tiers, width, phone]);

  const onPath = new Set([...ancestors(selected, links), selected]);
  const kids = new Set(links.filter((l) => l.from === selected).map((l) => l.to));
  const full = layout?.height ?? 0;
  const capped = phone && !open && full > MAP_WINDOW;
  const canExpand = phone && full > MAP_WINDOW;
  const shift = layout ? windowShift(full, layout.positions[selected]?.y ?? 0, capped) : 0;

  // Default edges first, then the selected pattern's outgoing ones, then the lit path on top.
  const edges = layout
    ? links
        .filter((l) => layout.positions[l.from] && layout.positions[l.to])
        .map((l) => {
          const up = onPath.has(l.from) && onPath.has(l.to);
          const down = l.from === selected;
          return {
            key: `${l.from}>${l.to}`,
            z: up ? 2 : down ? 1 : 0,
            d: edgePath(layout.positions[l.from]!, layout.positions[l.to]!),
            up,
            down,
          };
        })
        .toSorted((a, b) => a.z - b.z)
    : [];

  const mastered = patterns.filter((p) => p.state === "mastered").length;
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Pattern map">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-heading font-semibold text-text">Patterns</h2>
        <span className="tabular text-small font-medium text-mute">
          {mastered} of {patterns.length} mastered
        </span>
      </div>
      <div
        className={`relative overflow-hidden rounded-[16px] border border-line px-3 py-5 transition-[height] duration-350 ease-in-out [--map-bg:color-mix(in_srgb,var(--color-background)_35%,var(--color-surface))] md:px-5 md:py-7 ${MAP_BG} ${
          canExpand && !capped ? "pb-16" : ""
        }`}
        // content-box: the padding sits around the window, as in the mock.
        style={{ height: layout ? (capped ? MAP_WINDOW : full) : undefined, boxSizing: "content-box" }}
      >
        <div
          ref={box}
          className="relative w-full transition-transform duration-350 ease-in-out"
          style={{ height: full, transform: `translateY(${shift}px)` }}
        >
          {layout && (
            <>
              <svg width={width} height={full} aria-hidden className="absolute inset-0 overflow-visible">
                {edges.map((e) => (
                  <path
                    key={e.key}
                    d={e.d}
                    fill="none"
                    strokeWidth={e.up ? 1.6 : 1.2}
                    strokeDasharray={e.down && !e.up ? "3 4" : undefined}
                    strokeLinecap="round"
                    className={`transition-[stroke] duration-250 ${
                      e.up
                        ? "stroke-cyan"
                        : e.down
                          ? "stroke-[color-mix(in_srgb,var(--color-cyan)_45%,transparent)]"
                          : "stroke-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
                    }`}
                  />
                ))}
              </svg>
              {patterns.map((p) => {
                const at = layout.positions[p.slug];
                if (!at) return null;
                return (
                  <Node
                    key={p.slug}
                    p={p}
                    x={at.x}
                    y={at.y}
                    w={at.w}
                    selected={p.slug === selected}
                    related={onPath.has(p.slug) || kids.has(p.slug)}
                    onSelect={onSelect}
                  />
                );
              })}
            </>
          )}
        </div>
        {canExpand && (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 flex h-18 items-end justify-center pb-3 ${
              capped ? "bg-linear-to-b/srgb from-transparent to-(--map-bg) to-70%" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={!capped}
              className="pointer-events-auto flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line-2 bg-surface px-3.5 text-small font-semibold text-text"
            >
              {capped ? "Show full map" : "Show less"}
              <svg viewBox="0 0 12 12" fill="none" aria-hidden className={`size-3 text-mute ${capped ? "" : "rotate-180"}`}>
                <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
