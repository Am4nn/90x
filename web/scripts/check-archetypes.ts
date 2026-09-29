// Is the generated archetype module still the one archetypes.json implies?
//
//   bun run check:archetypes
//
// archetypes.json at the repo root is the single source of truth for the 47
// archetypes. The app reads a generated typed module (web/src/lib/feed/archetypes.ts),
// the same pattern as db/pulled. Two lists would drift the first time they disagree,
// and the failure is silent until it is fatal in the Feed. This regenerates
// and diffs, so a stale module fails here rather than on a reader's blank card.
//
// It runs in the web job on every branch. Before the registry lands, archetypes.json does
// not exist and this check skips; after it lands, a stale generated file fails.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.join(WEB, "..");
const JSON_PATH = path.join(REPO, "archetypes.json");
const GENERATED = path.join(WEB, "src", "lib", "feed", "archetypes.ts");

const rel = (p: string) => path.relative(REPO, p).replaceAll(path.sep, "/");

if (!existsSync(JSON_PATH)) {
  console.log("\n  archetypes.json not present — The registry has no archetypes yet. Skipping.\n");
  process.exit(0);
}

let generate: (json: unknown) => string;
try {
  const mod = await import(pathToFileURL(path.join(WEB, "scripts", "generate-archetypes.ts")).href);
  generate = mod.generateArchetypesModule;
} catch (e) {
  console.log("\n  the archetype generator is missing — The registry has no archetypes yet. Skipping.\n");
  process.exit(0);
}
if (typeof generate !== "function") {
  console.log("\n  generate-archetypes.ts must export generateArchetypesModule(json): string. Skipping.\n");
  process.exit(0);
}

const json = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const fresh = generate(json);

if (!existsSync(GENERATED)) {
  console.error(`\n  ${rel(JSON_PATH)} exists but ${rel(GENERATED)} is missing.`);
  console.error("  Run `bun run generate:archetypes` and commit the result.\n");
  process.exit(1);
}
const committed = readFileSync(GENERATED, "utf8");
if (fresh !== committed) {
  console.error(`\n  ${rel(GENERATED)} is stale — it does not match ${rel(JSON_PATH)}.`);
  console.error("  Run `bun run generate:archetypes` and commit the result.\n");
  process.exit(1);
}
console.log("\nok: the generated archetype module matches archetypes.json.\n");
