import { run as direct } from "./direct";
import { check, summary } from "./harness";
import { run as http } from "./http";
import { build, leftovers, teardown } from "./world";

// Break our own app. Every round on the security design is tried for real
// against a real database and, when an origin is given, a real server, with
// what falls over reported rather than swallowed. Non-zero if anything gives.
//
//   bun run break-in                              the direct round only
//   bun run break-in --http=http://localhost:3000 direct + the HTTP sweep
//   bun run break-in --http-only --http=...       the HTTP sweep only
//
// It creates its own people and removes all of them at the end, borrows no
// account and touches nobody else's rows, so the same round runs anywhere.

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const hasFlag = (name: string) => process.argv.includes(name);

const base = arg("http") ?? null;
const httpOnly = hasFlag("--http-only");

const world = await build();
console.log(`world ${world.tag}: four people, nothing borrowed`);

let crashed: unknown = null;
try {
  if (!httpOnly) await direct(world);
  if (base) await http(world, base);
  else if (!httpOnly) console.log("\nskip   the HTTP sweep  no --http=<origin> given");
} catch (e) {
  crashed = e;
}

await teardown(world);
check("the round cleans up after itself", (await leftovers(world)) === 0);

if (crashed) {
  console.error("\nthe round itself fell over:");
  console.error(crashed);
  process.exit(1);
}

process.exit(summary() === 0 ? 0 : 1);
