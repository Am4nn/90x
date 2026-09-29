"use client";

import Link from "next/link";
import { roadmapTitle } from "@/components/library/roadmap";
import { useRoadmapNodes } from "@/components/library/use-roadmap-nodes";
import { buildGraph, type GraphBranch } from "@/lib/library/graph-layout";
import type { Roadmap } from "@/lib/library/roadmap";

export function RoadmapGraphs({ roadmaps }: { roadmaps: Roadmap[] }) {
  return (
    <div className="flex flex-col gap-8">
      {roadmaps.map((r) => (
        <RoadmapGraph key={r.roadmap} roadmap={r} />
      ))}
    </div>
  );
}

function RoadmapGraph({ roadmap }: { roadmap: Roadmap }) {
  const { nodes, done, toggle } = useRoadmapNodes(roadmap);
  const graph = buildGraph(nodes);

  return (
    <section aria-label={`${roadmapTitle(roadmap.roadmap)} roadmap`} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-heading font-semibold text-text">{roadmapTitle(roadmap.roadmap)}</h3>
        <span className="shrink-0 text-small text-mute">
          {done} of {nodes.length}
        </span>
      </div>
      {graph.orphans.length > 0 && <Branches branches={graph.orphans} onToggle={toggle} />}
      <ol className="flex flex-col border-l-2 border-line-2 pl-4 md:ml-4">
        {graph.spine.map((entry) => (
          <li key={entry.node.id} className="flex flex-col gap-2 py-2">
            <Node branch={entry} current={entry.current} onToggle={toggle} />
            {entry.branches.length > 0 && <Branches branches={entry.branches} onToggle={toggle} />}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Branches({ branches, onToggle }: { branches: GraphBranch[]; onToggle: (id: string, next: boolean) => void }) {
  return (
    <ul className="ml-4 flex flex-col gap-2 border-l-2 border-dashed border-line-2 pl-4 md:ml-6">
      {branches.map((b) => (
        <li key={b.node.id}>
          <Node branch={b} onToggle={onToggle} />
        </li>
      ))}
    </ul>
  );
}

function Node({ branch, current, onToggle }: { branch: GraphBranch; current?: boolean; onToggle: (id: string, next: boolean) => void }) {
  const { node, soon, href } = branch;
  const look = current
    ? "border-cyan bg-cyan-bg text-cyan"
    : soon
      ? "border-dashed border-line-2 bg-surface text-text-2"
      : "border-line-2 bg-surface-2 text-text";
  const label = (
    <span
      className={`min-w-0 flex-1 ${node.kind === "topic" ? "font-semibold" : "text-small"} ${node.done ? "line-through opacity-60" : ""}`}
    >
      {node.label}
    </span>
  );
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${look}`}>
      <button
        type="button"
        aria-pressed={node.done}
        aria-label={node.done ? `Mark ${node.label} as not covered` : `Mark ${node.label} as covered`}
        onClick={() => onToggle(node.id, !node.done)}
        className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md border ${
          node.done ? "border-cyan bg-cyan-bg text-cyan" : "border-line-2 text-transparent hover:border-cyan"
        }`}
      >
        ✓
      </button>
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 hover:underline">
          {label}
        </Link>
      ) : (
        label
      )}
      {soon && <span className="shrink-0 text-tag text-mute">soon</span>}
    </div>
  );
}
