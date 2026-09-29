"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { tickRoadmapNodeAction } from "@/app/actions/today";
import type { Roadmap } from "@/lib/library/roadmap";

const TITLES: Record<string, string> = {
  "system-design": "System Design",
  "software-architect": "Software Architect",
  "api-design": "API Design",
  "computer-science": "Computer Science",
  "datastructures-and-algorithms": "Data Structures & Algorithms",
  "software-design-architecture": "Software Design & Architecture",
  "postgresql-dba": "PostgreSQL",
  "spring-boot": "Spring Boot",
  "ai-engineer": "AI Engineer",
  "machine-learning": "Machine Learning",
  "prompt-engineering": "Prompt Engineering",
  "engineering-manager": "Engineering Manager",
};

export const roadmapTitle = (slug: string) => TITLES[slug] ?? slug.replace(/-/g, " ");

export function RoadmapList({ roadmaps }: { roadmaps: Roadmap[] }) {
  if (!roadmaps.length) return null;
  return (
    <div className="flex flex-col gap-6">
      {roadmaps.map((r) => (
        <RoadmapSection key={r.roadmap} roadmap={r} />
      ))}
    </div>
  );
}

function RoadmapSection({ roadmap }: { roadmap: Roadmap }) {
  const [, startTransition] = useTransition();
  // The tick has to feel instant; the server action refreshes behind it.
  const [nodes, tick] = useOptimistic(roadmap.nodes, (current, id: string) =>
    current.map((n) => (n.id === id ? { ...n, done: !n.done } : n)),
  );
  const done = nodes.filter((n) => n.done).length;

  return (
    <details className="rounded-xl border border-line bg-surface" open={roadmap.done > 0}>
      <summary className="flex cursor-pointer items-baseline justify-between gap-3 px-4 py-3.5">
        <span className="font-display text-heading font-semibold text-text">{roadmapTitle(roadmap.roadmap)}</span>
        <span className="shrink-0 text-small text-mute">
          {done} of {nodes.length}
        </span>
      </summary>
      <ul className="flex flex-col border-t border-line">
        {nodes.map((node) => (
          <li key={node.id} className="border-t border-line first:border-0">
            <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
              <button
                type="button"
                aria-pressed={node.done}
                aria-label={node.done ? `Mark ${node.label} as not covered` : `Mark ${node.label} as covered`}
                onClick={() => {
                  startTransition(async () => {
                    tick(node.id);
                    await tickRoadmapNodeAction(node.id, !node.done);
                  });
                }}
                className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md border ${
                  node.done ? "text-bg border-cyan bg-cyan" : "border-line-2 text-transparent hover:border-cyan"
                }`}
              >
                ✓
              </button>
              <span
                className={`flex-1 ${node.kind === "subtopic" ? "text-small text-text-2" : "font-semibold text-text"} ${
                  node.done ? "line-through opacity-60" : ""
                }`}
              >
                {node.label}
              </span>
              {node.hasLesson && node.topicSlug && (
                <Link href={`/library/topic/${node.topicSlug}`} className="shrink-0 text-small text-cyan hover:underline">
                  Lesson
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
