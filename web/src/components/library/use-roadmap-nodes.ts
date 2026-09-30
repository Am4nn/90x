"use client";

import { useOptimistic, useTransition } from "react";
import { tickRoadmapNodeAction } from "@/app/actions/today";
import type { Roadmap } from "@/lib/library/roadmap";

/** The shared tick-a-node state for both roadmap views: the list and the graph.
 *  The tick is instant and optimistic; the server action refreshes behind it. */
export function useRoadmapNodes(roadmap: Roadmap) {
  const [, startTransition] = useTransition();
  const [nodes, tick] = useOptimistic(roadmap.nodes, (current, id: string) =>
    current.map((n) => (n.id === id ? { ...n, done: !n.done } : n)),
  );
  const done = nodes.filter((n) => n.done).length;
  const toggle = (id: string, next: boolean) =>
    startTransition(async () => {
      tick(id);
      await tickRoadmapNodeAction(id, next);
    });
  return { nodes, done, toggle };
}
