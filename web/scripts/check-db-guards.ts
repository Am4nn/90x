// Checks the database's own guards from the db review (migration 038) against the
// real schema. One transaction, always rolled back. Run with `bun run check:db-guards`.
//
// - Deleting a user who approved someone or reviewed a batch works, and the audit
//   columns go null (they used to block the delete).
// - Deleting a problem or a card that someone has history on fails, instead of
//   cascading the history away; with no history it still goes.
// - cards.format and profiles.timezone reject values the app could not use.
// - ai_usage.cost_usd adds up exactly.

import postgres from "postgres";

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("DIRECT_URL is not set. See .env.example.");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
type Tx = postgres.TransactionSql;

const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

/** The SQLSTATE a statement fails with, or null when it succeeds. Rolled back to a savepoint either way. */
async function failsWith(tx: Tx, run: (sp: Tx) => Promise<unknown>): Promise<string | null> {
  try {
    await tx.savepoint(async (sp) => {
      await run(sp);
      throw new Error("ok");
    });
  } catch (e) {
    const code = (e as { code?: string }).code;
    return code ?? null;
  }
  return null;
}

const ROLLBACK = new Error("rollback");
const FK_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";

try {
  await sql.begin(async (tx) => {
    const admin = "00000000-0000-4000-8000-0000000000d1";
    const reader = "00000000-0000-4000-8000-0000000000d2";
    for (const id of [admin, reader])
      await tx`insert into auth.users (id, email, aud, role) values (${id}, ${`guard-${id.slice(-2)}@example.test`}, 'authenticated', 'authenticated')`;

    await tx`insert into public.topics (slug, domain, name) values ('guard-topic', 'dsa', 'Guard topic')`;
    for (const slug of ["guard-held", "guard-bare"])
      await tx`insert into public.problems (slug, kind, title, difficulty) values (${slug}, 'leetcode', 'Guard', 'Easy')`;
    const [batch] =
      await tx`insert into public.card_batches (domain, status, reviewed_by) values ('dsa', 'published', ${admin}) returning id`;
    const cards = await tx`insert into public.cards (batch_id, topic_slug, problem_slug, format, prompt_md, answer_md, status)
      values (${batch!.id}, 'guard-topic', 'guard-held', 'pick_one', 'held', 'x', 'live'),
             (${batch!.id}, 'guard-topic', null, 'pick_one', 'bare', 'x', 'live') returning id, prompt_md`;
    const held = cards.find((c) => c.prompt_md === "held")!.id as string;
    const bare = cards.find((c) => c.prompt_md === "bare")!.id as string;
    await tx`insert into public.batch_review_items (batch_id, card_id, verdict, decided_by) values (${batch!.id}, ${held}, 'good', ${admin})`;
    await tx`update public.user_approvals set status = 'approved', decided_at = now(), decided_by = ${admin} where user_id = ${reader}`;
    await tx`insert into public.checkins (user_id, problem_slug, result, minutes) values (${reader}, 'guard-held', 'solved', 10)`;
    await tx`insert into public.card_reviews (user_id, card_id, score, outcome, graded_by) values (${reader}, ${held}, 1, 'correct', 'pure')`;

    // 1. Admin audit columns no longer block deleting the admin.
    expect(
      "deleting an admin who decided and reviewed things succeeds",
      (await failsWith(tx, (sp) => sp`delete from auth.users where id = ${admin}`)) === null,
    );
    await tx`delete from auth.users where id = ${admin}`;
    const [audit] = await tx`select
      (select decided_by from public.user_approvals where user_id = ${reader}) as approval,
      (select reviewed_by from public.card_batches where id = ${batch!.id}) as batch,
      (select decided_by from public.batch_review_items where card_id = ${held}) as item`;
    expect(
      "their audit columns are set null, the decisions stay",
      audit!.approval === null && audit!.batch === null && audit!.item === null,
    );

    // 2. Catalog deletes stop at learning history.
    expect(
      "deleting a card with someone's answers fails",
      (await failsWith(tx, (sp) => sp`delete from public.cards where id = ${held}`)) === FK_VIOLATION,
    );
    expect(
      "deleting a problem with a check-in fails",
      (await failsWith(tx, (sp) => sp`delete from public.problems where slug = 'guard-held'`)) === FK_VIOLATION,
    );
    expect(
      "deleting a batch whose card has answers fails",
      (await failsWith(tx, (sp) => sp`delete from public.card_batches where id = ${batch!.id}`)) === FK_VIOLATION,
    );
    expect(
      "a card nobody has touched can still be deleted",
      (await failsWith(tx, (sp) => sp`delete from public.cards where id = ${bare}`)) === null,
    );
    expect(
      "a problem nobody has touched can still be deleted",
      (await failsWith(tx, (sp) => sp`delete from public.problems where slug = 'guard-bare'`)) === null,
    );

    // 3. Values the app could not use.
    expect(
      "cards.format rejects an unknown format",
      (await failsWith(tx, (sp) => sp`update public.cards set format = 'pick-one' where id = ${bare}`)) === CHECK_VIOLATION,
    );
    expect(
      "cards.format accepts a primitive",
      (await failsWith(tx, (sp) => sp`update public.cards set format = 'claim_grid' where id = ${bare}`)) === null,
    );
    expect(
      "profiles.timezone rejects a name the server does not know",
      (await failsWith(tx, (sp) => sp`update public.profiles set timezone = 'Mars/Olympus_Mons' where user_id = ${reader}`)) ===
        CHECK_VIOLATION,
    );
    expect(
      "profiles.timezone accepts a real zone",
      (await failsWith(tx, (sp) => sp`update public.profiles set timezone = 'America/New_York' where user_id = ${reader}`)) === null,
    );

    // 4. Spend adds up exactly: ten 0.1s are 1, not 0.9999999999999999.
    for (let i = 0; i < 10; i++)
      await tx`insert into public.ai_usage (user_id, route, model, cost_usd) values (${reader}, 'guard', 'guard', 0.1)`;
    const [spend] = await tx`select sum(cost_usd)::text as total from public.ai_usage where route = 'guard'`;
    expect("ai_usage.cost_usd sums exactly", spend!.total === "1.000000", spend!.total);

    throw ROLLBACK;
  });
} catch (e) {
  if (e !== ROLLBACK) {
    console.error(`FAIL setup: ${(e as Error).message}`);
    failures.push("setup");
  }
} finally {
  await sql.end();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll database guard checks passed");
