import Link from "next/link";
import { layoutMap } from "@/lib/library/map-layout";
import type { PatternNode } from "@/lib/library/queries";

const FILL: Record<PatternNode["state"], string> = {
  mastered: "var(--x-dsa)",
  started: "color-mix(in srgb, var(--x-dsa) 45%, var(--x-surface))",
  weak: "var(--x-bad)",
  untouched: "var(--x-line-2)",
};

/** Pattern Map: patterns as linked nodes lit by mastery; the
 *  weakest pulse. Each node links to its problems. */
export function PatternMap({
  patterns,
  links,
  selected,
}: {
  patterns: PatternNode[];
  links: { from: string; to: string }[];
  selected?: string;
}) {
  const { positions, width, height } = layoutMap(patterns, links);
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mx-auto block w-full max-w-[760px] min-w-[520px]"
        role="img"
        aria-label="Pattern map"
      >
        {links.map((l) => {
          const a = positions[l.from];
          const b = positions[l.to];
          if (!a || !b) return null;
          const lit = patterns.find((p) => p.slug === l.from)?.state === "mastered";
          return (
            <line
              key={`${l.from}-${l.to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={lit ? "var(--x-dsa)" : "#20252f"}
              strokeWidth={lit ? 1.6 : 1.2}
            />
          );
        })}
        {patterns.map((p) => {
          const pos = positions[p.slug];
          if (!pos) return null;
          const on = p.slug === selected;
          return (
            <Link key={p.slug} href={`/library?area=dsa&pattern=${p.slug}`} aria-label={`${p.name}: ${p.solved} of ${p.total} solved`}>
              <g className="cursor-pointer">
                {p.state === "weak" && <circle cx={pos.x} cy={pos.y} r={15} fill="var(--x-bad)" className="animate-pulse" opacity={0.3} />}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={on ? 10 : 8}
                  fill={FILL[p.state]}
                  stroke={on ? "var(--x-accent)" : "none"}
                  strokeWidth={2}
                />
                <text
                  x={pos.x}
                  y={pos.y + 22}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill={p.state === "untouched" && !on ? "#8c94a3" : "var(--x-text)"}
                  style={{ fontFamily: "var(--font-manrope)" }}
                >
                  {p.name.length > 18 ? `${p.name.slice(0, 17)}…` : p.name}
                </text>
              </g>
            </Link>
          );
        })}
      </svg>
    </div>
  );
}
