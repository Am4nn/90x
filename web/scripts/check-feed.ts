// Checks the feed's server rules against the real database. Everything runs in
// one transaction that is always rolled back. Run with `bun run check:feed`.

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cards } from "@/db/schema";
import { hideStaleCards, reportCard } from "@/lib/feed/flag-service";

const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

const ROLLBACK = new Error("rollback");
const users = ["00000000-0000-4000-8000-0000000000e1", "00000000-0000-4000-8000-0000000000e2"] as const;
const now = new Date("2026-09-27T06:00:00Z");

try {
  await db.transaction(async (tx) => {
    for (const id of users) {
      await tx.execute(
        sql`insert into auth.users (id, email, aud, role) values (${id}, ${`feed-${id.slice(-2)}@example.test`}, 'authenticated', 'authenticated')`,
      );
      await tx.execute(sql`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${id}`);
    }
    await tx.execute(sql`insert into public.topics (slug, domain, name) values ('ff-topic', 'cs', 'Feed test') on conflict do nothing`);
    const inserted = await tx.execute<{ id: string }>(sql`
      insert into public.cards (topic_slug, format, prompt_md, answer_md, status) values
        ('ff-topic', 'typed', 'flag me', 'a', 'live'),
        ('ff-topic', 'typed', 'everyone skips me', 'a', 'live'),
        ('ff-topic', 'typed', 'someone answers me', 'a', 'live')
      returning id`);
    const [flagged, skipped, answered] = inserted.map((r) => r.id);
    if (!flagged || !skipped || !answered) throw new Error("test cards not created");

    // Two different users' flags hide a card; the same user flagging twice doesn't.
    const [u1, u2] = users;
    const once = await reportCard(u1, flagged, "wrong answer", tx);
    const again = await reportCard(u1, flagged, "still wrong", tx);
    expect("one user flagging twice counts once and doesn't hide", once.flags === 1 && again.flags === 1 && !again.hidden);
    const twice = await reportCard(u2, flagged, "unclear", tx);
    const [row] = await tx.select().from(cards).where(eq(cards.id, flagged));
    expect("two users' flags hide the card", twice.hidden && row?.hidden === true && row.flagCount === 2);

    // Stale sweep: only cards everyone skipped for 14+ days.
    const review = (card: string, user: string, outcome: string, daysAgo: number) =>
      tx.execute(sql`insert into public.card_reviews (user_id, card_id, answer, score, outcome, graded_by, created_at)
        values (${user}, ${card}, '', 0, ${outcome}, 'skip', ${new Date(now.getTime() - daysAgo * 86_400_000).toISOString()})`);
    await review(skipped, u1, "skipped", 20);
    await review(skipped, u2, "skipped", 15);
    await review(answered, u1, "skipped", 20);
    await review(answered, u2, "correct", 15);
    await hideStaleCards(now, tx);
    const state = await tx.execute<{ id: string; hidden: boolean }>(
      sql`select id, hidden from public.cards where id in (${skipped}, ${answered})`,
    );
    const hidden = new Map(state.map((r) => [r.id, r.hidden]));
    expect("a card everyone skipped for 14 days is hidden", hidden.get(skipped) === true);
    expect("a card someone answered stays", hidden.get(answered) === false);

    throw ROLLBACK;
  });
} catch (e) {
  if (e !== ROLLBACK) {
    console.error(`FAIL setup: ${(e as Error).message}`);
    failures.push("setup");
  }
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll feed checks passed");
process.exit(0);
