// Every Playwright spec is run by exactly one CI shard.
//
//   bun run check:shards
//
// The e2e job is split across parallel shards that each name the specs they run,
// because Playwright's own `--shard` balances on test count and gave 22 tests
// against 10 — a long pole barely shorter than the whole suite. Naming them
// buys a real split and costs this check.
//
// What it costs without the check: a spec no shard names simply never runs, and
// CI is green and *faster* for it. Nothing else in CI can see that.
// Adding a spec file is the common case; renaming one is the nasty case, because
// the old name goes on matching nothing.
//
// It also refuses a spec named twice, which is not dangerous but is somebody
// paying for the same tests in two shards and thinking they are sharded.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.join(WEB, "..");
const WORKFLOW = path.join(REPO, ".github", "workflows", "ci.yml");
const E2E_DIR = path.join(WEB, "e2e");
const SHARD_JOB = "e2e-shard";

// Shard names whose spec file does not exist yet, because the branch that writes it
// is still open. Registering them up front is what keeps parallel branches
// out of ci.yml: a branch that had to add its own name would collide with the
// others, and a branch that forgot would ship a spec no shard runs - the exact
// silence this check exists to break.
//
// This list is the cost of that, and it is deliberately a list and not a flag: every
// name here is a promise with an owner, and the reorg empties it. A name that
// outlives its branch is a spec nobody wrote, which is worth seeing.
const PENDING = new Set([
  "me-reorg", // shell, Friends, Me, Settings
  "lessons", // Coach modes and the Lessons page
  "weekly-read", // the Coach read on Today
  "chat-state", // the chat working state
  "problem-page", // the DSA problem page
  "plan-setup", // Plan and Set up
]);

type Workflow = {
  jobs?: Record<string, { strategy?: { matrix?: { include?: { id?: string; specs?: string }[] } } }>;
};

let shards: { id: string; specs: string[] }[];
try {
  const workflow = parse(readFileSync(WORKFLOW, "utf8")) as Workflow;
  // `e2e-shard` runs them; `e2e` is the gate job that branch protection names, and
  // it has no matrix. Reading the wrong one is how this check broke the moment the
  // sharded job was renamed.
  const include = workflow.jobs?.[SHARD_JOB]?.strategy?.matrix?.include;
  if (!include?.length) throw new Error(`the ${SHARD_JOB} job has no shard matrix`);
  shards = include.map((row, i) => ({
    id: row.id ?? `#${i + 1}`,
    specs: (row.specs ?? "").split(/\s+/).filter(Boolean),
  }));
} catch (e) {
  console.error(`\n  Could not read the e2e shards from ${path.relative(REPO, WORKFLOW)}.`);
  console.error(`  ${e instanceof Error ? e.message : e}`);
  console.error("  Fix this check rather than deleting it: it is the only thing that");
  console.error("  notices a spec no shard runs.\n");
  process.exit(1);
}

// Playwright takes its positional arguments as substring filters on the path, so
// a name matches a spec when the spec's path contains it. Resolved the same way
// here, or this check would be answering a different question from CI.
//
// The config sets `testDir` but no `testMatch`, so Playwright collects the
// default `**/*.@(spec|test).?(c|m)[jt]s?(x)`: spec *or* test, TypeScript or
// JavaScript, at any depth. Matching only the top-level `*.spec.ts` would let a
// nested spec, a `.test.ts`, or a `.spec.js` ship without ever running — the
// exact silence this check exists to break.
const isSpec = (name: string) => /\.(?:spec|test)\.(?:c|m)?[jt]sx?$/.test(name);

function collectSpecs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSpecs(full));
    else if (entry.isFile() && isSpec(entry.name)) out.push(path.relative(E2E_DIR, full).replaceAll(path.sep, "/"));
  }
  return out;
}

const specs = collectSpecs(E2E_DIR).toSorted();

console.log("\n  Playwright specs, by the shard that runs them\n");

const runners = new Map<string, string[]>(specs.map((s) => [s, []]));
const matchesNothing: { shard: string; name: string }[] = [];
const pending: { shard: string; name: string }[] = [];

for (const shard of shards) {
  for (const name of shard.specs) {
    const hit = specs.filter((s) => s.includes(name));
    if (!hit.length) {
      if (PENDING.has(name)) pending.push({ shard: shard.id, name });
      else matchesNothing.push({ shard: shard.id, name });
    }
    for (const s of hit) runners.get(s)?.push(shard.id);
  }
}

const unrun: string[] = [];
const twice: string[] = [];
for (const [spec, by] of runners) {
  const where = by.length ? by.join(" + ") : "NOBODY";
  console.log(`    ${spec.padEnd(24)}${where}`);
  if (!by.length) unrun.push(spec);
  if (by.length > 1) twice.push(`${spec} (${by.join(", ")})`);
}

const problems: string[] = [];
if (unrun.length) problems.push(`no shard runs ${unrun.join(", ")} — those tests would never run, and CI would be green`);
for (const { shard, name } of pending) console.log(`    ${name.padEnd(24)}${shard} — pending, its branch has not merged`);

for (const { shard, name } of matchesNothing)
  problems.push(`shard "${shard}" names "${name}", which matches no spec — renamed or deleted?`);
if (twice.length) problems.push(`two shards both run ${twice.join("; ")} — paid for twice, sharded once`);

if (problems.length) {
  console.log("\n    FAIL");
  for (const p of problems) console.log(`          ${p}`);
  console.log(`\n    Fix the e2e matrix in ${path.relative(REPO, WORKFLOW)}.\n`);
  process.exit(1);
}

console.log(`\n    ok: ${specs.length} specs across ${shards.length} shards, each run exactly once.\n`);
