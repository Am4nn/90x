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

type Primitive = { id: string; shape: string | null };
type Archetype = {
  id: string;
  label: string;
  primitives: string[];
  areas: string[];
  difficulty: string[];
  whyStep: boolean;
};

type Registry = {
  answerShapes: string[];
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

function parseRegistry(json: unknown): Registry {
  if (typeof json !== "object" || json === null) throw new Error("archetypes.json: expected an object");
  const root = json as Record<string, unknown>;

  const answerShapes = asStringArray(root.answerShapes, "answerShapes");
  if (answerShapes.length === 0) throw new Error("archetypes.json: answerShapes must not be empty");

  const primitivesRaw = root.primitives;
  if (!Array.isArray(primitivesRaw)) throw new Error("archetypes.json: primitives must be an array");
  const primitives: Primitive[] = primitivesRaw.map((entry) => {
    if (typeof entry !== "object" || entry === null) throw new Error("archetypes.json: each primitive must be an object");
    const p = entry as Record<string, unknown>;
    const id = asString(p.id, "primitive.id");
    const shape = p.shape === null ? null : asString(p.shape, `primitive ${id}.shape`);
    return { id, shape };
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

  return { answerShapes, primitives, archetypes };
}

function q(value: string): string {
  return JSON.stringify(value);
}

export function generateArchetypesModule(json: unknown): string {
  const { answerShapes, primitives, archetypes } = parseRegistry(json);

  const lines: string[] = [];
  lines.push("// generated from archetypes.json — do not edit");
  lines.push("");
  lines.push("export const PRIMITIVES = [");
  for (const p of primitives) {
    const shape = p.shape === null ? "null" : q(p.shape);
    lines.push(`  { id: ${q(p.id)}, shape: ${shape} },`);
  }
  lines.push("] as const;");
  lines.push("");
  lines.push('export type Primitive = (typeof PRIMITIVES)[number]["id"];');
  lines.push(`export type AnswerShape = ${answerShapes.map(q).join(" | ")};`);
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
