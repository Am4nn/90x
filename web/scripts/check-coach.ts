// Does coach memory extraction work end to end? Creates a throwaway user,
// extracts memory from two short sessions with the real fast model (fractions
// of a cent), checks merging and ageing, then deletes the user (cascades).
// Run by hand: bun run check:coach

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { checkins, coachMemory, missions, problems, profiles, solutionReviews, topicProgress, topics } from "@/db/schema";
import { resolveProposal } from "@/lib/coach/act";
import { addThreadView, saveAddAnswer, validatePicks } from "@/lib/coach/add";
import { addReason } from "@/lib/coach/add-rules";
import { ageMemory, extractMemory, listMemory, memoryForPrompt } from "@/lib/coach/memory";
import { deleteFact } from "@/lib/coach/memory-edit";
import { coachModel, modelName } from "@/lib/coach/model";
import { listSolutionReviews } from "@/lib/coach/solution-review";
import { ensureThread, findOrCreateDayThread, listThreads, previousAddThread, saveMessage } from "@/lib/coach/threads";
import { localDate } from "@/lib/tracker/dates";

const failures: string[] = [];
const pick = (kind: "problem" | "topic", ref: string) => ({ kind, ref, why: "w" });
function expect(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

const user = "00000000-0000-4000-8000-0000000000c1";
await db.execute(sql`delete from auth.users where id = ${user}`);
await db.execute(
  sql`insert into auth.users (id, email, aud, role) values (${user}, 'coach-check@example.test', 'authenticated', 'authenticated')`,
);

let hiddenSlug: string | null = null;
try {
  // The hidden "add" thread kind: no model calls, so `COACH_ADD_ONLY=1` runs just this block.
  const day = "2026-10-10";
  const [a, b] = await Promise.all([findOrCreateDayThread(user, day), findOrCreateDayThread(user, day)]);
  expect("two quick calls make one add thread for the day", a.id === b.id && a.kind === "add" && a.ref === day && a.created !== b.created);
  await saveMessage(user, a.id, { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: "a medium graph problem" }] });
  const chat = await ensureThread(user, { id: crypto.randomUUID(), kind: "chat", ref: null, title: "A chat" });
  if (chat) await saveMessage(user, chat.id, { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: "hi" }] });
  const listed = await listThreads(user);
  expect(
    "a chat is listed, the add thread (with a message) is not",
    listed.some((t) => t.id === chat?.id) && !listed.some((t) => t.id === a.id),
  );
  expect("the previous day's unextracted add thread is found", (await previousAddThread(user, "2026-10-11"))?.id === a.id);
  expect("and none for the same day", (await previousAddThread(user, day)) === null);
  // Add with Coach: server-side pick validation and the confirm path. No model: proposals are saved directly.
  const slugs = Array.from({ length: 8 }, (_, i) => `zz-add-check-${i}`);
  const [pA = "", pB = "", pC = "", pSolved = "", pPremium = "", pOpen = "", pLate = "", pLate2 = ""] = slugs;
  await db
    .insert(problems)
    .values(
      slugs.map((slug, i) => ({ slug, kind: "leetcode", title: `Add check ${i}`, difficulty: "Medium", premium: slug === pPremium })),
    );
  const [sd = "", cs = ""] = (
    await db
      .select({ slug: topics.slug })
      .from(topics)
      .where(sql`domain = 'system_design'`)
      .limit(2)
  ).map((t) => t.slug);
  const [dsa = ""] = (
    await db
      .select({ slug: topics.slug })
      .from(topics)
      .where(sql`domain = 'dsa'`)
      .limit(1)
  ).map((t) => t.slug);
  const [studied = ""] = (
    await db
      .select({ slug: topics.slug })
      .from(topics)
      .where(sql`domain = 'cs'`)
      .limit(1)
  ).map((t) => t.slug);
  await db.insert(checkins).values({ userId: user, problemSlug: pSolved, result: "solved" });
  await db.insert(topicProgress).values({ userId: user, topicSlug: studied });
  // The app dates an add by the reader's own timezone, so the check must too (UTC is a different day for part of every evening in India).
  const [tzRow] = await db.select({ tz: profiles.timezone }).from(profiles).where(eq(profiles.userId, user));
  const today = localDate(tzRow?.tz ?? "UTC");
  await db
    .insert(missions)
    .values({ userId: user, date: today, slotType: "new_problem", ref: pOpen, estMinutes: 40, status: "open", reason: "x", isExtra: true });
  // Three picks at most reach validatePicks, so the drops are checked three at a time.
  const check = (picks: ReturnType<typeof pick>[]) => validatePicks(user, picks, false, today);
  const kept = [
    ...(await check([pick("problem", pA), pick("problem", pSolved), pick("problem", pPremium)])),
    ...(await check([pick("problem", "no-such-slug"), pick("problem", pOpen), pick("topic", studied)])),
    ...(await check([pick("topic", dsa), pick("topic", sd)])),
  ];
  const t = kept.find((k) => k.ref === sd);
  expect(
    "validatePicks keeps only the unsolved listed problem and the unstudied topic: solved, premium, unknown, open, studied and DSA are each dropped",
    kept.map((k) => k.ref).join() === [pA, sd].join(),
    kept.map((k) => k.ref).join(),
  );
  expect("a topic item carries its area and meta", t?.area === "system_design" && t.slotType === "topic" && t.meta.endsWith("topic"));

  const mk = async (refs: [string, "problem" | "topic"][]) => {
    const items = await validatePicks(
      user,
      refs.map(([r, k]) => pick(k, r)),
      false,
      today,
    );
    const msg = await saveAddAnswer(user, a.id, "say", items);
    return { items, toolCallId: msg.proposal?.toolCallId ?? "" };
  };
  const added = async () =>
    db
      .select({ ref: missions.ref, reason: missions.reason, isExtra: missions.isExtra, date: missions.date })
      .from(missions)
      .where(sql`${missions.userId} = ${user} and ${missions.ref} like 'zz-add-check-%' and ${missions.ref} <> ${pOpen}`);

  const p1 = await mk([
    [pA, "problem"],
    [pB, "problem"],
    [pC, "problem"],
  ]);
  const outside = await resolveProposal(user, a.id, p1.toolCallId, "confirm", ["not-in-the-proposal"]);
  expect("confirm with a ref outside the proposal is refused", "error" in outside && outside.error === "That suggestion can't be used.");
  const empty = await resolveProposal(user, a.id, p1.toolCallId, "confirm", []);
  expect("confirm with no refs ticked is refused", "error" in empty && empty.error === "That suggestion can't be used.");
  expect("and inserts nothing", (await added()).length === 0);
  const subset = await resolveProposal(user, a.id, p1.toolCallId, "confirm", [pB]);
  const rows = await added();
  expect("confirm with a subset adds only the ticked one", "ok" in subset && rows.length === 1 && rows[0]!.ref === pB);
  expect(
    "as an extra for today with the Added with Coach reason",
    rows[0]?.isExtra === true && rows[0].date === today && rows[0].reason === addReason(p1.items[1]!.meta),
    rows[0]?.reason,
  );
  const p1Again = await resolveProposal(user, a.id, p1.toolCallId, "confirm", [pB]);
  expect("a second confirm says Already done.", "error" in p1Again && p1Again.error === "Already done.");

  const p2 = await mk([
    [pLate, "problem"],
    [pLate2, "problem"],
  ]);
  const view = await addThreadView(user, day);
  const proposals = view.messages.flatMap((m) => (m.proposal ? [m.proposal] : []));
  expect(
    "a newer proposal dismisses an older undecided one (the confirmed one stays confirmed)",
    proposals.find((p) => p.toolCallId === p1.toolCallId)?.status === "confirmed" &&
      proposals.find((p) => p.toolCallId === p2.toolCallId)?.status === undefined,
  );
  await db.insert(checkins).values({ userId: user, problemSlug: pLate, result: "solved" });
  const lateOut = await resolveProposal(user, a.id, p2.toolCallId, "confirm");
  expect(
    "a problem solved between propose and confirm is skipped, the other still added",
    "ok" in lateOut && (await added()).map((r) => r.ref).includes(pLate2) && !(await added()).map((r) => r.ref).includes(pLate),
  );
  const p3 = await mk([[pLate2, "problem"]]);
  expect("an already open pick never reaches a proposal", p3.items.length === 0);
  const p4 = await mk([
    [sd, "topic"],
    [cs, "topic"],
  ]);
  await db
    .insert(topicProgress)
    .values([
      { userId: user, topicSlug: sd },
      { userId: user, topicSlug: cs },
    ])
    .onConflictDoNothing();
  const goneOut = await resolveProposal(user, a.id, p4.toolCallId, "confirm");
  expect(
    "all picks done between propose and confirm gives Those are done already.",
    "error" in goneOut && goneOut.error === "Those are done already.",
  );
  const none0 = await resolveProposal(user, a.id, p4.toolCallId, "dismiss");
  expect("a failed confirm leaves the proposal open to dismiss", "ok" in none0 && none0.status === "dismissed");
  expect(
    "the day view returns the thread and counts the messages above the last 6",
    view.threadId === a.id && view.earlier === Math.max(0, view.messages.length - 6),
  );
  const confirmedP1 = view.messages.find((m) => m.proposal?.toolCallId === p1.toolCallId)?.proposal;
  expect(
    "a partial confirm lists only what was added, not every proposed item",
    confirmedP1?.status === "confirmed" && confirmedP1.items.map((i) => i.ref).join() === pB,
  );

  if (process.env.COACH_ADD_ONLY) {
    console.log(failures.length ? `${failures.length} check(s) failed` : "Add-thread checks passed");
    await db.execute(sql`delete from auth.users where id = ${user}`);
    await db.delete(problems).where(sql`slug like 'zz-add-check-%'`);
    process.exit(failures.length ? 1 : 0);
  }

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

  {
    // Your reviews: newest first, owner-scoped, filterable by problem, unlisted problems still show. No model involved.
    const threeProblems = await db.select({ slug: problems.slug, title: problems.title }).from(problems).limit(3);
    if (threeProblems.length < 3) throw new Error("check:coach needs at least 3 problems in the local database");
    const [rv1, rv2, rv3] = threeProblems as [
      (typeof threeProblems)[number],
      (typeof threeProblems)[number],
      (typeof threeProblems)[number],
    ];
    await db.update(problems).set({ hidden: true }).where(eq(problems.slug, rv3.slug));
    hiddenSlug = rv3.slug;
    const base = { userId: user, language: "python", code: "pass" };
    await db.insert(solutionReviews).values([
      {
        ...base,
        problemSlug: rv1.slug,
        correct: true,
        complexity: { yours: { time: "O(n)" } },
        createdAt: new Date(Date.now() - 3000).toISOString(),
      },
      { ...base, problemSlug: rv2.slug, correct: false, createdAt: new Date(Date.now() - 2000).toISOString() },
      { ...base, problemSlug: rv3.slug, correct: null, createdAt: new Date(Date.now() - 1000).toISOString() },
    ]);
    const all = await listSolutionReviews(user);
    expect("reviews list newest first", all.map((r) => r.problemSlug).join() === [rv3.slug, rv2.slug, rv1.slug].join());
    expect(
      "an unlisted problem's review still lists, with its title and no verdict",
      all[0]?.title === rv3.title && all[0]?.correct === null,
    );
    expect("time comes from complexity.yours.time", all[2]?.time === "O(n)" && all[1]?.time === null && all[1]?.correct === false);
    const one = await listSolutionReviews(user, { problemSlug: rv1.slug });
    expect("reviews filter to one problem", one.length === 1 && one[0]?.correct === true);
    expect("another user sees none", (await listSolutionReviews("00000000-0000-4000-8000-0000000000c2")).length === 0);
  }
} finally {
  if (hiddenSlug) await db.update(problems).set({ hidden: false }).where(eq(problems.slug, hiddenSlug));
  await db.execute(sql`delete from auth.users where id = ${user}`);
  await db.delete(problems).where(sql`slug like 'zz-add-check-%'`);
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll coach checks passed");
process.exit(0);
