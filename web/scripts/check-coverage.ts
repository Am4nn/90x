// How much of the pure rules the unit tests actually execute.
//
//   bun run check:coverage
//
// 387 tests with no floor: nothing stopped coverage decaying as the app grew, and
// the decay is invisible because the suite stays green either way. A new module
// with no tests does not break anything today, it just quietly lowers the share
// of the rules anybody has checked.
//
// Scoped to `src/lib/**` by `vitest.config.ts`, which is what these tests are for.
// Components, pages, server actions and the database layer are covered by
// Playwright and the `check:*` scripts against a real database; counting them here
// would measure the wrong thing and invite tests written to move a number.
//
// Statements and branches only. Function and line counts move with refactoring
// that changes nothing about what is tested, and a gate that fires on a rename is
// a gate somebody disables.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUMMARY = path.join(WEB, "coverage", "coverage-summary.json");

// Percentages. Only ever raised.
const FLOORS = { statements: 44, branches: 40 } as const;
// v8 counts branches a little differently between Node versions, so a CI runner
// can legitimately differ from a laptop by a fraction. Same reasoning as the
// gzip tolerance in check-bundle.ts: fail on a real drop, not on noise.
const SLACK = 0.5;
// Worth turning the ratchet for.
const WORTH_RAISING = 1.5;

let total: Record<string, { pct: number }>;
try {
  total = JSON.parse(readFileSync(SUMMARY, "utf8")).total;
} catch {
  console.error("\n  No coverage to read. Run `bunx vitest run --coverage` first.\n");
  process.exit(1);
}

console.log("\n  Coverage of src/lib, by the unit tests\n");
const low: string[] = [];
const high: string[] = [];
for (const [what, floor] of Object.entries(FLOORS)) {
  const pct = total[what]?.pct;
  if (typeof pct !== "number") {
    console.error(`\n  The summary has no "${what}" total, so this measured nothing.`);
    console.error("  Vitest's report shape has changed; fix this check rather than deleting it.\n");
    process.exit(1);
  }
  console.log(`    ${what.padEnd(12)}${pct.toFixed(2).padStart(6)}%   floor ${floor}`);
  if (pct < floor - SLACK) low.push(`${what} is ${pct.toFixed(2)}%, under ${floor}`);
  if (pct > floor + WORTH_RAISING) high.push(`${what} to ${Math.floor(pct)}`);
}

if (low.length) {
  console.log("\n    FAIL");
  for (const f of low) console.log(`          ${f}`);
  console.log("\n    Something in src/lib grew without tests. Write them rather than");
  console.log("    lowering the floor.\n");
  process.exit(1);
}
if (high.length) console.log(`\n    Well above the floor. Raise ${high.join(" and ")} so it cannot slip back.`);
console.log("\n    ok: the rules are still as tested as they were.\n");
