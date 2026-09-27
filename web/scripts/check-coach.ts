// Does coach memory extraction work end to end? Creates a throwaway user,
// extracts memory from two short sessions with the real fast model (fractions
// of a cent), checks merging and ageing, then deletes the user (cascades).
// Run by hand: bun run check:coach

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { coachMemory } from "@/db/schema";
import { ageMemory, extractMemory, listMemory, memoryForPrompt } from "@/lib/coach/memory";
import { deleteFact } from "@/lib/coach/memory-edit";
import { coachModel, modelName } from "@/lib/coach/model";

const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

const user = "00000000-0000-4000-8000-0000000000c1";
await db.execute(sql`delete from auth.users where id = ${user}`);
await db.execute(
  sql`insert into auth.users (id, email, aud, role) values (${user}, 'coach-check@example.test', 'authenticated', 'authenticated')`,
);

try {
  const { model, degraded } = await coachModel();
  expect("coach model is picked", Boolean(modelName(model)), `${modelName(model)}${degraded ? ", degraded" : ""}`);

  const first = await extractMemory(
    user,
    { kind: "thread", id: "t1" },
    `User: I keep forgetting the empty array case in sliding window problems, it happened again today.
Coach: Let's add a guard first. What should the answer be for an empty input?
User: Zero, right. Also my Amazon onsite is on November 20, so I want to focus on system design this month.
User: I learn best when you give me one hint at a time instead of the full solution.`,
  );
  const facts = await listMemory(user);
  expect(
    "facts are extracted from a session",
    first.added >= 2,
    `${first.added} added: ${facts.map((f) => `${f.kind}: ${f.text}`).join(" | ")}`,
  );
  expect(
    "a goal with the interview date is remembered",
    facts.some((f) => f.kind === "goal" && /nov|20/i.test(f.text)),
  );
  const dated = facts.find((f) => f.kind === "goal" && /nov|20/i.test(f.text));
  expect("the dated goal expires on its date", Boolean(dated?.expiresOn?.endsWith("-11-20")), dated?.expiresOn ?? "no date");

  const habit = facts.find((f) => f.kind === "habit");
  const second = await extractMemory(
    user,
    { kind: "review", id: "r1" },
    `Solution review for Minimum Window Substring: the code crashes when s is empty; no guard for empty input again.`,
  );
  const after = await listMemory(user);
  const again = after.find((f) => f.id === habit?.id);
  expect("a habit seen again gets the new evidence", Boolean(again && again.evidence.length >= 2), `${second.updated} updated`);
  expect("the prompt block lists what the coach knows", (await memoryForPrompt(user)).includes("Goals:"));

  const goal = after.find((f) => f.kind === "goal" && /nov|20/i.test(f.text));
  await extractMemory(user, { kind: "thread", id: "t2" }, `User: Update: Amazon moved my onsite from November 20 to December 5.`);
  const moved = await listMemory(user, { includeResolved: true });
  expect(
    "a corrected goal replaces the old one instead of sitting beside it",
    moved.find((f) => f.id === goal?.id)?.status === "resolved" &&
      moved.some((f) => f.kind === "goal" && f.status === "active" && /dec|5/i.test(f.text)),
    moved.map((f) => `${f.status}: ${f.text}${f.expiresOn ? ` (until ${f.expiresOn})` : ""}`).join(" | "),
  );

  const preference = moved.find((f) => f.kind === "preference" && f.status !== "resolved");
  if (preference) await deleteFact(user, preference.id);
  await extractMemory(user, { kind: "thread", id: "t3" }, `User: Again, please give me one hint at a time instead of the full solution.`);
  const relearned = (await listMemory(user)).filter((f) => f.kind === "preference");
  expect(
    "a fact the user deleted is not learned again",
    Boolean(preference) && relearned.length === 0,
    relearned.map((f) => f.text).join(" | "),
  );

  // Habits age from last_seen_at, which status changes don't touch (updated_at does, via its trigger).
  const lastSeen = (days: number) =>
    db
      .update(coachMemory)
      .set({ lastSeenAt: new Date(Date.now() - days * 86_400_000).toISOString() })
      .where(and(eq(coachMemory.userId, user), eq(coachMemory.kind, "habit")));
  await lastSeen(20);
  await ageMemory(user);
  const improving = (await listMemory(user)).filter((f) => f.kind === "habit" && f.status === "improving");
  expect("habits quiet for 14 days improve", improving.length > 0);
  await lastSeen(29);
  await ageMemory(user);
  const resolved = (await listMemory(user, { includeResolved: true })).filter((f) => f.kind === "habit" && f.status === "resolved");
  expect("and resolve 28 days after they were last seen, even right after changing status", resolved.length > 0);
} finally {
  await db.execute(sql`delete from auth.users where id = ${user}`);
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll coach checks passed");
process.exit(0);
