// Reads archetypes.json at the repo root and writes the typed module the app
// imports: web/src/lib/feed/archetypes.ts.
//
//   bun run generate:archetypes
//
// archetypes.json is the single source of truth for the 47 archetypes. This
// generator turns it into a typed TS module the same way db:pull turns the
// database into src/db/pulled. check-archetypes.ts imports generateArchetypesModule
// and diffs a fresh generation against the committed file, so the output must be
// deterministic: stable ordering, stable spacing, a trailing newline.

import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.join(WEB, "..");
const JSON_PATH = path.join(REPO, "archetypes.json");
const GENERATED = path.join(WEB, "src", "lib", "feed", "archetypes.ts");

type Primitive = { id: string; shape: string | null; optionsShape: string };
type Archetype = {
  id: string;
  label: string;
  primitives: string[];
  areas: string[];
  difficulty: string[];
  whyStep: boolean;
};
type AnswerContract = {
  whyStep: { options: string; correct: string };
  number: { value: string; tolerance: string };
  tapInPlace: string;
};

type Registry = {
  answerShapes: string[];
  answerContract: AnswerContract;
  primitives: Primitive[];
  archetypes: Archetype[];
};

function asString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`archetypes.json: ${what} must be a non-empty string`);
  return value;
}

function asStringArray(value: unknown, what: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new Error(`archetypes.json: ${what} must be an array of strings`);
  }
  return value as string[];
}

// The shapes `cards.options` can take, in the order the generated OptionsShape
// union lists them. Each primitive names exactly one, so whatever
// writes `cards.options` and the app that reads it share one contract.
const OPTION_SHAPES = ["list", "match", "bucket", "assemble", "grid", "none"] as const;

/** Reads `answerContract`, whose field values are TS type expressions. */
function parseAnswerContract(value: unknown): AnswerContract {
  if (typeof value !== "object" || value === null) throw new Error("archetypes.json: answerContract must be an object");
  const c = value as Record<string, unknown>;
  const fields = <K extends string>(what: string, names: readonly K[]): Record<K, string> => {
    const obj = c[what];
    if (typeof obj !== "object" || obj === null) throw new Error(`archetypes.json: answerContract.${what} must be an object`);
    const o = obj as Record<string, unknown>;
    const out = {} as Record<K, string>;
    for (const name of names) out[name] = asString(o[name], `answerContract.${what}.${name}`);
    return out;
  };
  const whyStep = fields("whyStep", ["options", "correct"] as const);
  const number = fields("number", ["value", "tolerance"] as const);
  return {
    whyStep: { options: whyStep.options, correct: whyStep.correct },
    number: { value: number.value, tolerance: number.tolerance },
    tapInPlace: asString(c.tapInPlace, "answerContract.tapInPlace"),
  };
}

function parseRegistry(json: unknown): Registry {
  if (typeof json !== "object" || json === null) throw new Error("archetypes.json: expected an object");
  const root = json as Record<string, unknown>;

  const answerShapes = asStringArray(root.answerShapes, "answerShapes");
  if (answerShapes.length === 0) throw new Error("archetypes.json: answerShapes must not be empty");
  const answerContract = parseAnswerContract(root.answerContract);

  const primitivesRaw = root.primitives;
  if (!Array.isArray(primitivesRaw)) throw new Error("archetypes.json: primitives must be an array");
  const primitives: Primitive[] = primitivesRaw.map((entry) => {
    if (typeof entry !== "object" || entry === null) throw new Error("archetypes.json: each primitive must be an object");
    const p = entry as Record<string, unknown>;
    const id = asString(p.id, "primitive.id");
    const shape = p.shape === null ? null : asString(p.shape, `primitive ${id}.shape`);
    const optionsShape = asString(p.optionsShape, `primitive ${id}.optionsShape`);
    if (!(OPTION_SHAPES as readonly string[]).includes(optionsShape)) {
      throw new Error(`archetypes.json: primitive ${id}.optionsShape must be one of ${OPTION_SHAPES.join(", ")}`);
    }
    return { id, shape, optionsShape };
  });

  const archetypesRaw = root.archetypes;
  if (!Array.isArray(archetypesRaw)) throw new Error("archetypes.json: archetypes must be an array");
  const archetypes: Archetype[] = archetypesRaw.map((entry) => {
    if (typeof entry !== "object" || entry === null) throw new Error("archetypes.json: each archetype must be an object");
    const a = entry as Record<string, unknown>;
    const id = asString(a.id, "archetype.id");
    return {
      id,
      label: asString(a.label, `archetype ${id}.label`),
      primitives: asStringArray(a.primitives, `archetype ${id}.primitives`),
      areas: asStringArray(a.areas, `archetype ${id}.areas`),
      difficulty: asStringArray(a.difficulty, `archetype ${id}.difficulty`),
      whyStep: a.whyStep === true,
    };
  });

  return { answerShapes, answerContract, primitives, archetypes };
}

function q(value: string): string {
  return JSON.stringify(value);
}

export function generateArchetypesModule(json: unknown): string {
  const { answerShapes, answerContract, primitives, archetypes } = parseRegistry(json);

  const lines: string[] = [];
  lines.push("// generated from archetypes.json — do not edit");
  lines.push("");
  lines.push("export const PRIMITIVES = [");
  for (const p of primitives) {
    const shape = p.shape === null ? "null" : q(p.shape);
    lines.push(`  { id: ${q(p.id)}, shape: ${shape}, optionsShape: ${q(p.optionsShape)} },`);
  }
  lines.push("] as const;");
  lines.push("");
  lines.push('export type Primitive = (typeof PRIMITIVES)[number]["id"];');
  lines.push(`export type AnswerShape = ${answerShapes.map(q).join(" | ")};`);
  lines.push(`export type OptionsShape = ${OPTION_SHAPES.map(q).join(" | ")};`);
  lines.push("");
  lines.push("// The answer contract's shapes, from `answerContract` in archetypes.json.");
  lines.push("// A Hard card's why-step is a second chosen answer; a numeric card's stored");
  lines.push("// answer is the expected value plus the tolerance it is graded against.");
  lines.push(`export type WhyStep = { options: ${answerContract.whyStep.options}; correct: ${answerContract.whyStep.correct} };`);
  lines.push(`export type NumberAnswer = { value: ${answerContract.number.value}; tolerance: ${answerContract.number.tolerance} };`);
  lines.push("");
  lines.push(`// tap_in_place: ${answerContract.tapInPlace}`);
  lines.push("");
  lines.push("export const ARCHETYPES = [");
  for (const a of archetypes) {
    lines.push("  {");
    lines.push(`    id: ${q(a.id)},`);
    lines.push(`    label: ${q(a.label)},`);
    lines.push(`    primitives: [${a.primitives.map(q).join(", ")}],`);
    lines.push(`    areas: [${a.areas.map(q).join(", ")}],`);
    lines.push(`    difficulty: [${a.difficulty.map(q).join(", ")}],`);
    lines.push(`    whyStep: ${a.whyStep},`);
    lines.push("  },");
  }
  lines.push("] as const;");
  lines.push("");
  lines.push('export type ArchetypeId = (typeof ARCHETYPES)[number]["id"];');
  lines.push("");
  lines.push("export function shapeOf(primitive: Primitive): AnswerShape | null {");
  lines.push("  return PRIMITIVES.find((p) => p.id === primitive)?.shape ?? null;");
  lines.push("}");
  lines.push("");
  lines.push("export function optionsShapeOf(primitive: Primitive): OptionsShape | null {");
  lines.push("  return PRIMITIVES.find((p) => p.id === primitive)?.optionsShape ?? null;");
  lines.push("}");
  lines.push("");
  lines.push("export function archetype(id: ArchetypeId): (typeof ARCHETYPES)[number] | undefined {");
  lines.push("  return ARCHETYPES.find((a) => a.id === id);");
  lines.push("}");

  return lines.join("\n") + "\n";
}

// Written when run directly (bun run generate:archetypes), not when imported by
// check-archetypes.ts. Bun's import.meta.main would be ideal but it is not typed
// here, so compare the entry script against this file.
function isEntryScript(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryScript()) {
  const json = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  const text = generateArchetypesModule(json);
  mkdirSync(path.dirname(GENERATED), { recursive: true });
  writeFileSync(GENERATED, text);
  const count = parseRegistry(json).archetypes.length;
  console.log(`wrote ${path.relative(REPO, GENERATED)} (${count} archetypes)`);
}
