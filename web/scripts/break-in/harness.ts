// The scoreboard. One line a check, and the exit code is the whole point:
// `bun run break-in` is a command, not a checklist.

let failures = 0;
let held = 0;
const broken: string[] = [];

export function section(name: string): void {
  console.log(`\n--- ${name} ---`);
}

export function check(name: string, ok: boolean, detail = ""): void {
  if (ok) held += 1;
  else {
    failures += 1;
    broken.push(name);
  }
  console.log(`${ok ? "held  " : "BROKE "} ${name}${detail ? "  " + detail : ""}`);
}

/**
 * A check that passes only when the call REFUSES.
 *
 * Written this way because the shape repeats, and every repetition is a chance
 * to write the try/catch the wrong way round and get a green line for a hole.
 * Only for services that throw on refusal (invites, membership). Services that
 * return a result are asserted with `check` on the return value instead.
 */
export async function refuses(name: string, attempt: () => Promise<unknown>): Promise<void> {
  try {
    await attempt();
    check(name, false, "it went through");
  } catch (e) {
    check(name, true, (e as Error).message);
  }
}

/** A check that passes only when the call SUCCEEDS. The other half of refuses. */
export async function allows(name: string, attempt: () => Promise<unknown>): Promise<void> {
  try {
    await attempt();
    check(name, true);
  } catch (e) {
    check(name, false, (e as Error).message);
  }
}

export function skipped(name: string, why: string): void {
  console.log(`skip   ${name}  ${why}`);
}

export function summary(): number {
  console.log(`\n${held} held, ${failures} broke`);
  for (const b of broken) console.log(`  BROKE ${b}`);
  return failures;
}
