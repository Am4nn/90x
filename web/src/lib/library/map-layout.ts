export type MapNode = { slug: string; name: string };
export type MapLink = { from: string; to: string };
export type Placed = { x: number; y: number; layer: number };

const LAYER_GAP = 78;
const PAD_X = 46;
const PAD_Y = 30;
const WIDTH = 340;

/** Layered layout: each pattern sits one row below its deepest prerequisite
 *  (NeetCode roadmap order); nodes in a row are spread evenly. */
export function layoutMap(nodes: MapNode[], links: MapLink[]) {
  const incoming = new Map<string, string[]>();
  for (const l of links) incoming.set(l.to, [...(incoming.get(l.to) ?? []), l.from]);

  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (slug: string): number => {
    if (layer.has(slug)) return layer.get(slug)!;
    if (visiting.has(slug)) return 0; // cycle guard
    visiting.add(slug);
    const parents = (incoming.get(slug) ?? []).filter((p) => nodes.some((n) => n.slug === p));
    const d = parents.length ? Math.max(...parents.map(depth)) + 1 : 0;
    visiting.delete(slug);
    layer.set(slug, d);
    return d;
  };
  nodes.forEach((n) => depth(n.slug));

  const rows = new Map<number, string[]>();
  for (const n of nodes) rows.set(layer.get(n.slug)!, [...(rows.get(layer.get(n.slug)!) ?? []), n.slug]);

  const positions: Record<string, Placed> = {};
  for (const [d, slugs] of rows) {
    const step = (WIDTH - 2 * PAD_X) / Math.max(slugs.length - 1, 1);
    slugs.forEach((slug, i) => {
      const x = slugs.length === 1 ? WIDTH / 2 : PAD_X + i * step;
      positions[slug] = { x: Math.round(x), y: PAD_Y + d * LAYER_GAP, layer: d };
    });
  }
  const maxLayer = Math.max(0, ...rows.keys());
  return { positions, width: WIDTH, height: PAD_Y * 2 + maxLayer * LAYER_GAP + 20 };
}

export type Mastery = "untouched" | "started" | "mastered" | "weak";

/** From a user's check-ins on a pattern's important problems. */
export function masteryState(s: { total: number; solved: number; failed: number }): Mastery {
  if (s.solved + s.failed === 0) return "untouched";
  if (s.failed > s.solved) return "weak";
  if (s.total > 0 && s.solved / s.total >= 0.6) return "mastered";
  return "started";
}
