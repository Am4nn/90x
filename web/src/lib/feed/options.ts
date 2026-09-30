import type { Primitive } from "./archetypes";

// How a card's question content is read from `cards.options`. The column is one
// jsonb value, but what it means depends on the primitive: a flat list of
// choices for pick one and order, a two-sided object for match and bucket, and
// a token list plus a pre-fill mask for assemble. the first version gave only the
// `options` column, so the second side of a match and the bucket columns live
// in the same value rather than in a column of their own.

export type QuestionOptions = {
  /** The choices / items / tokens / statements the reader works with. */
  items: string[];
  /** match: the right-hand meanings; bucket: the column labels. Null elsewhere. */
  targets: string[] | null;
  /** assemble: which item is pre-filled in the line (same length as items). Null elsewhere. */
  template: boolean[] | null;
};

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

function parseAssemble(value: unknown): QuestionOptions {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const { tokens, fixed } = value as { tokens?: unknown; fixed?: unknown };
    const items = strings(tokens);
    if (items.length) {
      // `fixed` is absent on an empty template, so a missing mask means "build
      // the whole line" and every token is a gap.
      const template =
        Array.isArray(fixed) && fixed.length === items.length ? items.map((_, i) => fixed[i] === true) : items.map(() => false);
      return { items, targets: null, template };
    }
  }
  // A writer that sent plain tokens gets an empty template: build the whole line.
  const items = strings(value);
  return { items, targets: null, template: items.length ? items.map(() => false) : null };
}

function parseTwoSided(value: unknown): QuestionOptions {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const { left, right, items, columns } = value as { left?: unknown; right?: unknown; items?: unknown; columns?: unknown };
    const first = strings(left ?? items);
    const second = strings(right ?? columns);
    if (first.length && second.length) return { items: first, targets: second, template: null };
  }
  const items = strings(value);
  return { items, targets: null, template: null };
}

/** Reads `cards.options` into the shape the answer screens need, per primitive. */
export function parseOptions(primitive: Primitive | null, value: unknown): QuestionOptions {
  switch (primitive) {
    case "assemble":
      return parseAssemble(value);
    case "match":
    case "bucket":
      return parseTwoSided(value);
    default:
      return { items: strings(value), targets: null, template: null };
  }
}
