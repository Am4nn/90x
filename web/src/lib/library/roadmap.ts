import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { lessons, roadmapNodes, roadmapProgress } from "@/db/schema";

export type RoadmapNode = {
  id: string;
  label: string;
  kind: string;
  topicSlug: string | null;
  hasLesson: boolean;
  done: boolean;
};

export type Roadmap = { roadmap: string; nodes: RoadmapNode[]; done: number };

/** Every roadmap for an area, in the diagram's reading order, with what the
 *  viewer has ticked off. Nodes carry no parent, so the list is flat. */
export async function roadmapsFor(userId: string, domain: string): Promise<Roadmap[]> {
  const rows = await db
    .select({
      id: roadmapNodes.id,
      roadmap: roadmapNodes.roadmap,
      label: roadmapNodes.label,
      kind: roadmapNodes.kind,
      topicSlug: roadmapNodes.topicSlug,
      lessonSlug: lessons.topicSlug,
    })
    .from(roadmapNodes)
    .leftJoin(lessons, eq(lessons.topicSlug, roadmapNodes.topicSlug))
    .where(eq(roadmapNodes.domain, domain))
    .orderBy(asc(roadmapNodes.roadmap), asc(roadmapNodes.sort));
  if (!rows.length) return [];

  const ticked = await db
    .select({ nodeId: roadmapProgress.nodeId })
    .from(roadmapProgress)
    .where(
      and(
        eq(roadmapProgress.userId, userId),
        inArray(
          roadmapProgress.nodeId,
          rows.map((r) => r.id),
        ),
      ),
    );
  const done = new Set(ticked.map((t) => t.nodeId));

  const byRoadmap = new Map<string, RoadmapNode[]>();
  for (const row of rows) {
    const node: RoadmapNode = {
      id: row.id,
      label: row.label,
      kind: row.kind,
      topicSlug: row.topicSlug,
      hasLesson: row.lessonSlug !== null,
      done: done.has(row.id),
    };
    byRoadmap.set(row.roadmap, [...(byRoadmap.get(row.roadmap) ?? []), node]);
  }
  return [...byRoadmap].map(([roadmap, nodes]) => ({
    roadmap,
    nodes,
    done: nodes.filter((n) => n.done).length,
  }));
}
