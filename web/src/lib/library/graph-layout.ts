import type { RoadmapNode } from "./roadmap";

export type GraphBranch = {
  node: RoadmapNode;
  /** Not written yet: drawn dashed and labelled, still tickable. */
  soon: boolean;
  /** Only set when the lesson exists and the slug is real. */
  href: string | null;
};

type SpineEntry = GraphBranch & {
  branches: GraphBranch[];
  /** The next topic to learn: the first one not ticked. */
  current: boolean;
};

export type Graph = { spine: SpineEntry[]; orphans: GraphBranch[] };

function toBranch(node: RoadmapNode): GraphBranch {
  return {
    node,
    soon: !node.hasLesson,
    href: node.hasLesson && node.topicSlug ? `/library/topic/${node.topicSlug}` : null,
  };
}

/** Nodes arrive flat and already in `sort` order, with no parent field. A
 *  subtopic belongs to the topic before it; that is an assumption about how the
 *  roadmaps were seeded, and this is the one place it lives. Subtopics that
 *  come before any topic are kept as orphans rather than dropped. */
export function buildGraph(nodes: RoadmapNode[]): Graph {
  const spine: SpineEntry[] = [];
  const orphans: GraphBranch[] = [];
  for (const node of nodes) {
    if (node.kind === "topic") {
      spine.push({ ...toBranch(node), branches: [], current: false });
      continue;
    }
    const owner = spine.at(-1);
    if (owner) owner.branches.push(toBranch(node));
    else orphans.push(toBranch(node));
  }
  const current = spine.find((s) => !s.node.done);
  if (current) current.current = true;
  return { spine, orphans };
}
