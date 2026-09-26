// Is anything we chose to depend on deprecated by the people who wrote it?
//
//   bun run check:deps
//
// The npm registry records a `deprecated` string per published version. It is
// the only warning a package ever gets to give, it appears once during an
// install and scrolls past, and it is how a dependency becomes unmaintained
// without anybody deciding to keep using it. Read on purpose, it is a fact that
// can gate a merge.
//
// DIRECT dependencies only, the ones in package.json. A deprecated package four
// levels down is its parent's problem and there is nothing to do about it here
// except wait; `bun audit` is what covers that half, on the axis where it
// matters. This asks the question a person can actually answer: is something we
// picked no longer the thing to pick.
//
// Exits non-zero on anything deprecated and not in ALLOWED, so it can gate CI.
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Deprecated on purpose, with the reason and what would end it.
 *
 * Hand-maintained, the same way `scripts/break-in/capabilities.ts` is. Adding a
 * line here is the deliberate part: it goes through review with a reason
 * attached, rather than a warning nobody reads going past in an install log.
 */
const ALLOWED: Record<string, string> = {
  // (name: why it is still here, and what would let it go)
};

interface Pkg {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** What is actually installed, which is not always what package.json asks for. */
async function installedVersion(name: string): Promise<string | null> {
  try {
    const raw = await readFile(path.join("node_modules", ...name.split("/"), "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? null;
  } catch {
    return null;
  }
}

/**
 * The registry's note on a version, or null.
 *
 * The abbreviated packument is a fraction of the full one and still carries
 * `deprecated` per version, which is the only field this needs.
 */
async function deprecationOf(name: string, version: string): Promise<string | null> {
  const response = await fetch(`https://registry.npmjs.org/${name}`, {
    headers: { Accept: "application/vnd.npm.install-v1+json" },
  });
  if (!response.ok) {
    throw new Error(`${name}: registry answered ${response.status}`);
  }
  const packument = (await response.json()) as {
    versions?: Record<string, { deprecated?: string }>;
  };
  const note = packument.versions?.[version]?.deprecated;
  return typeof note === "string" && note.trim() !== "" ? note.trim() : null;
}

const pkg = JSON.parse(await readFile("package.json", "utf8")) as Pkg;
const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].toSorted();

const found: { name: string; version: string; note: string }[] = [];
const unresolved: string[] = [];

const results = await Promise.all(
  names.map(async (name) => {
    const version = await installedVersion(name);
    if (!version) return { name, version: null, note: null };
    return { name, version, note: await deprecationOf(name, version) };
  }),
);

for (const r of results) {
  if (!r.version) {
    unresolved.push(r.name);
    continue;
  }
  if (r.note) found.push({ name: r.name, version: r.version, note: r.note });
}

if (unresolved.length > 0) {
  console.log(`Not installed, so not checked: ${unresolved.join(", ")}. Run bun install.`);
}

const unexpected = found.filter((f) => !(f.name in ALLOWED));

for (const f of found) {
  const known = f.name in ALLOWED;
  console.log(`${known ? "allowed " : "DEPRECATED"}  ${f.name}@${f.version}`);
  console.log(`            ${f.note}`);
  if (known) console.log(`            kept because: ${ALLOWED[f.name]}`);
}

if (unexpected.length === 0) {
  console.log(`${names.length} direct dependencies, nothing deprecated that is not deliberate.`);
  process.exit(0);
}

console.log(`\n${unexpected.length} deprecated dependency(ies). Replace it, or add it to ALLOWED in this file with a reason.`);
process.exit(1);
