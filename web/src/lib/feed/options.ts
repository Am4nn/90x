import { optionsShapeOf, type Primitive } from "./archetypes";

// The canonical `cards.options` encoding, parsed into the shape each answer
// screen renders. The shape a primitive uses is recorded in the registry
// (archetypes.json → optionsShapeOf), so whatever writes
// `cards.options` and the app that reads it agree on one contract instead of
// each hardcoding it. The jsonb column is one value; what it means depends on
// the primitive's optionsShape:
//
//   list     → string[]                          (pick_one, order, tap_in_place, claim_grid)
//   match    → { left, right }                   (the two sides to pair)
//   bucket   → { items, columns }                (items and the columns they land in)
//   assemble → { tokens, fixed }                 (tokens and which slots are pre-filled)
//   grid     → { rows, columns }                 (row and column labels of a toggle grid)
//   none     → null                              (numeric, self_rate)

export type CardOptions =
  | { shape: "list"; items: string[] }
  | { shape: "match"; left: string[]; right: string[] }
  | { shape: "bucket"; items: string[]; columns: string[] }
  | { shape: "assemble"; tokens: string[]; fixed: (number | null)[] }
  | { shape: "grid"; rows: string[]; columns: string[] };

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** An assemble `fixed` mask: one entry per token, the index into `tokens` that
 *  is pre-filled in that slot, or null for a gap the reader fills. A missing or
 *  malformed mask means "build the whole line", so every slot is a gap. */
function parseFixed(value: unknown, count: number): (number | null)[] {
  const blank = Array.from({ length: count }, () => null);
  if (!Array.isArray(value) || value.length !== count) return blank;
  const fixed = value.map((entry) =>
    typeof entry === "number" && Number.isInteger(entry) && entry >= 0 && entry < count ? entry : null,
  );
  // A mask that pre-fills nothing is the same as "build the whole line".
  return fixed.some((entry) => entry !== null) ? fixed : blank;
}

/** Reads `cards.options` against the primitive's optionsShape, normalising the
 *  jsonb into the canonical structure, or null when there is nothing to show. */
export function parseOptions(primitive: Primitive | null, value: unknown): CardOptions | null {
  switch (primitive ? optionsShapeOf(primitive) : null) {
    case "match": {
      const raw = asRecord(value);
      const left = strings(raw.left);
      const right = strings(raw.right);
      return left.length && right.length ? { shape: "match", left, right } : null;
    }
    case "bucket": {
      const raw = asRecord(value);
      const items = strings(raw.items);
      const columns = strings(raw.columns);
      return items.length && columns.length ? { shape: "bucket", items, columns } : null;
    }
    case "assemble": {
      const raw = asRecord(value);
      const tokens = strings(raw.tokens);
      if (!tokens.length) return null;
      return { shape: "assemble", tokens, fixed: parseFixed(raw.fixed, tokens.length) };
    }
    case "grid": {
      const raw = asRecord(value);
      const rows = strings(raw.rows);
      const columns = strings(raw.columns);
      return rows.length && columns.length ? { shape: "grid", rows, columns } : null;
    }
    case "list": {
      const items = strings(value);
      return items.length ? { shape: "list", items } : null;
    }
    default:
      // "none" (numeric, self_rate) and legacy cards with no primitive.
      return null;
  }
}

/** How many items an answer is drawn from, for grading an ordered or mapping
 *  shape without knowing which primitive produced it. */
export function optionsCount(options: CardOptions | null): number {
  if (!options) return 0;
  switch (options.shape) {
    case "list":
      return options.items.length;
    case "match":
      return options.left.length;
    case "bucket":
      return options.items.length;
    case "assemble":
      return options.tokens.length;
    case "grid":
      return options.rows.length;
  }
}
