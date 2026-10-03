// `bun audit`, minus the advisories we have accepted on the record.
//
//   bun run check:audit
//
// Plain `bun audit` is the right gate until an advisory arrives that has no fix. Then
// it fails every push to main for something nobody can act on, and the usual response
// (stop reading the failure, or delete the step) throws away the check for every
// advisory that comes after. So an advisory with no patched release can be accepted
// here, deliberately, with the reason and a date it has to be looked at again.
//
// Three things keep an exception from becoming a permanent blind spot:
//   - it EXPIRES: past `until`, this fails until someone re-reads the advisory and
//     either renews it with a new reason or removes it;
//   - it must still be NEEDED: if `bun audit` no longer reports the advisory (a fix
//     shipped, or the dependency went away), the exception is stale and this fails
//     until it is deleted, rather than quietly ignoring a name that matches nothing;
//   - everything NOT listed here still fails the build exactly as before.
//
// Hand-maintained, like `check-deps.ts`'s ALLOWED. Adding a line is the deliberate part:
// it goes through review with a reason attached.
//
// Exits non-zero on an expired or stale exception, or on any advisory not listed.

import { spawnSync } from "node:child_process";

type Exception = {
  /** Why this is safe to carry, and what would end it. */
  reason: string;
  /** The first day this fails again. ISO date. */
  until: string;
};

const EXCEPTIONS: Record<string, Exception> = {
  "GHSA-vfj7-8cjw-p6xm": {
    reason:
      "braces <= 3.0.3 stack-exhaustion DoS on deeply nested patterns (CVE-2026-93687, published 2026-09-18). " +
      "No patched release exists; 3.0.3 is the newest. It is reached only through shadcn (a build-time CSS import, " +
      '`@import "shadcn/tailwind.css"`) and eslint-config-next (a dev dependency) via fast-glob > micromatch, ' +
      "and the server bundle traces none of braces, micromatch or fast-glob. The pattern strings those tools see " +
      "are ours, never user input. Ends when braces publishes a fix (this then fails as stale) or on the date below.",
    until: "2026-12-03",
  },
};

const today = process.argv.find((a) => a.startsWith("--today="))?.slice("--today=".length) ?? new Date().toISOString().slice(0, 10);

function audit(args: string[]) {
  // node:child_process rather than the Bun global: tsc is not given Bun's types here.
  const run = spawnSync("bun", ["audit", ...args], { encoding: "utf8", shell: process.platform === "win32" });
  return {
    code: run.status ?? 1,
    text: `${run.stdout}
${run.stderr}`,
  };
}

const ids = Object.keys(EXCEPTIONS);
const problems: string[] = [];

for (const id of ids) {
  const entry = EXCEPTIONS[id];
  if (entry && entry.until <= today) {
    problems.push(`${id} expired on ${entry.until}. Re-read the advisory, then renew it with a new reason and date, or delete it.`);
  }
}

if (ids.length) {
  // Without the ignores: is each exception still describing something real?
  const bare = audit([]);
  for (const id of ids) {
    if (!bare.text.includes(id)) {
      problems.push(`${id} is no longer reported by \`bun audit\`. The exception is stale; delete it from check-audit.ts.`);
    }
  }
}

if (problems.length) {
  console.error(`check:audit: ${problems.length} problem${problems.length === 1 ? "" : "s"} with the accepted advisories\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const result = audit(ids.map((id) => `--ignore=${id}`));
process.stdout.write(result.text.trim() ? `${result.text.trim()}\n` : "");
if (result.code === 0 && ids.length) {
  console.log(`check:audit: clean, with ${ids.length} accepted advisor${ids.length === 1 ? "y" : "ies"}:`);
  for (const id of ids) console.log(`  - ${id}, until ${EXCEPTIONS[id]?.until}`);
}
process.exit(result.code);
