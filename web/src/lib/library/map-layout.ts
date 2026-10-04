// The DSA pattern map's geometry, ported from the mock's own script
// with its numbers. Pure, so the component only measures and draws.

export type MapLink = { from: string; to: string };
export type Placed = { x: number; y: number; w: number };

/** The dot's size; the label sits 7px under it and takes up to two lines (30px). */
export const DOT = 28;
export const NODE_H = DOT + 7 + 30;
/** On a phone the map shows a 340px window that follows the selection. */
export const MAP_WINDOW = 340;

/** Each pattern's stage: one below its deepest prerequisite (the NeetCode roadmap's order). */
export function patternTiers(slugs: string[], links: MapLink[]) {
  const known = new Set(slugs);
  const parents = new Map<string, string[]>();
  for (const l of links) if (known.has(l.from) && known.has(l.to)) parents.set(l.to, [...(parents.get(l.to) ?? []), l.from]);
  const tier = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (slug: string): number => {
    const seen = tier.get(slug);
    if (seen !== undefined) return seen;
    if (visiting.has(slug)) return 0; // a cycle in the data must not hang the page
    visiting.add(slug);
    const ps = parents.get(slug) ?? [];
    const d = ps.length ? Math.max(...ps.map(depth)) + 1 : 0;
    visiting.delete(slug);
    tier.set(slug, d);
    return d;
  };
  slugs.forEach(depth);
  return tier;
}

/**
 * Places the patterns in a box `width` wide: 5, 4 or 3 columns by width; a stage with more
 * patterns than columns wraps into staggered rows, so no dot sits right under a line passing
 * through. Returns each dot's centre x, its top y and its label width, plus the full height.
 */
export function layoutPatternMap(slugs: string[], tiers: Map<string, number>, width: number, phone: boolean) {
  const cols = width >= 560 ? 5 : width >= 400 ? 4 : 3;
  const colW = width / cols;
  const positions: Record<string, Placed> = {};
  const maxTier = Math.max(0, ...slugs.map((s) => tiers.get(s) ?? 0));
  let y = 0;
  let first = true;
  for (let t = 0; t <= maxTier; t++) {
    const list = slugs.filter((s) => (tiers.get(s) ?? 0) === t);
    if (!list.length) continue;
    const k = Math.ceil(list.length / cols);
    const per = Math.ceil(list.length / k);
    for (let r = 0; r < k; r++) {
      const row = list.slice(r * per, r * per + per);
      const cw = k > 1 ? Math.min(colW, width / (per + 0.5)) : colW;
      const off =
        k > 1 ? (width - (per + 0.5) * cw) / 2 + (r % 2 ? cw / 2 : 0) + ((per - row.length) * cw) / 2 : (width - row.length * cw) / 2;
      if (!first) y += r === 0 ? NODE_H + (phone ? 26 : 34) : NODE_H + 14;
      first = false;
      row.forEach((slug, i) => {
        positions[slug] = { x: off + (i + 0.5) * cw, y, w: Math.floor(cw - 6) };
      });
    }
  }
  return { positions, height: y + NODE_H };
}

/** A curve from dot centre to dot centre. */
export function edgePath(a: Placed, b: Placed) {
  const y1 = a.y + DOT / 2;
  const y2 = b.y + DOT / 2;
  const dy = (y2 - y1) * 0.5;
  return `M${a.x} ${y1} C${a.x} ${y1 + dy} ${b.x} ${y2 - dy} ${b.x} ${y2}`;
}

/** Everything that leads to `slug`: its prerequisites, theirs, and so on. */
export function ancestors(slug: string, links: MapLink[]) {
  const out = new Set<string>();
  const go = (s: string) => {
    for (const l of links) {
      if (l.to === s && !out.has(l.from)) {
        out.add(l.from);
        go(l.from);
      }
    }
  };
  go(slug);
  return out;
}

/**
 * How far up to slide the map on a phone so the selected dot sits mid-window; 0 when the whole
 * map shows (a wide screen, a short map, or "Show full map").
 */
export function windowShift(fullHeight: number, selectedY: number, capped: boolean) {
  if (!capped || fullHeight <= MAP_WINDOW) return 0;
  const up = Math.max(0, Math.min(fullHeight - MAP_WINDOW, selectedY - MAP_WINDOW / 2 + NODE_H / 2));
  return up === 0 ? 0 : -up;
}

export type Mastery = "untouched" | "started" | "mastered" | "weak";

/** From a user's check-ins on a pattern's important problems. */
export function masteryState(s: { total: number; solved: number; failed: number }): Mastery {
  if (s.solved + s.failed === 0) return "untouched";
  if (s.failed > s.solved) return "weak";
  if (s.total > 0 && s.solved / s.total >= 0.6) return "mastered";
  return "started";
}
