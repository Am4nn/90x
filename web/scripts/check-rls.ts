// Checks the row-level security rules against the real database.
// Everything runs inside one transaction that is always rolled back, so it
// leaves no rows behind. Run with `bun run check:rls`.

import postgres from "postgres";

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("DIRECT_URL is not set. See .env.example.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

type Tx = postgres.TransactionSql;

const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

// Run `fn` as a signed-in user, then return to the owner role.
async function as<T>(tx: Tx, userId: string | null, fn: () => Promise<T>): Promise<T> {
  if (userId) {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
  } else {
    await tx`select set_config('request.jwt.claims', '{"role":"anon"}', true)`;
    await tx`set local role anon`;
  }
  try {
    return await fn();
  } finally {
    await tx`reset role`;
  }
}

const ROLLBACK = new Error("rollback");

try {
  await sql.begin(async (tx) => {
    // Three users: approved A, approved B, pending P. Creating them in
    // auth.users fires the trigger that makes their profile + approval rows.
    const ids = {
      a: "00000000-0000-4000-8000-00000000000a",
      b: "00000000-0000-4000-8000-00000000000b",
      p: "00000000-0000-4000-8000-00000000000c",
    };
    for (const [key, id] of Object.entries(ids)) {
      await tx`insert into auth.users (id, email, aud, role, raw_user_meta_data)
               values (${id}, ${`rls-${key}@example.test`}, 'authenticated', 'authenticated',
                       ${tx.json({ full_name: `RLS ${key}` })})`;
    }
    const approvals = await tx`select user_id, status from public.user_approvals where user_id in ${tx([ids.a, ids.b, ids.p])}`;
    expect("trigger creates a pending approval per new user", approvals.length === 3 && approvals.every((r) => r.status === "pending"));
    const profiles = await tx`select count(*)::int as n from public.profiles where user_id in ${tx([ids.a, ids.b, ids.p])}`;
    expect("trigger creates a profile per new user", profiles[0].n === 3);

    await tx`update public.user_approvals set status = 'approved', decided_at = now() where user_id in ${tx([ids.a, ids.b])}`;

    // Content rows to read.
    await tx`insert into public.sources (id, name, domain, role) values ('rls-src', 'RLS source', 'dsa', 'cards')`;
    await tx`insert into public.topics (slug, domain, name) values ('rls-topic', 'dsa', 'RLS topic')`;
    await tx`insert into public.problems (slug, kind, title, difficulty, pattern_slug, source_id)
             values ('rls-problem', 'leetcode', 'RLS problem', 'Easy', 'rls-topic', 'rls-src')`;
    const batch = await tx`insert into public.card_batches (domain, status) values ('dsa', 'draft') returning id`;
    await tx`insert into public.cards (batch_id, topic_slug, format, prompt_md, answer_md, status)
             values (${batch[0].id}, 'rls-topic', 'typed', 'draft card', 'x', 'draft'),
                    (${batch[0].id}, 'rls-topic', 'typed', 'live card', 'x', 'live')`;

    // Content visibility.
    const anonProblems = await as(tx, null, () => tx`select slug from public.problems where slug = 'rls-problem'`);
    expect("anonymous user reads no problems", anonProblems.length === 0);
    const pendingProblems = await as(tx, ids.p, () => tx`select slug from public.problems where slug = 'rls-problem'`);
    expect("pending user reads no problems", pendingProblems.length === 0);
    const approvedProblems = await as(tx, ids.a, () => tx`select slug from public.problems where slug = 'rls-problem'`);
    expect("approved user reads problems", approvedProblems.length === 1);
    const approvedCards = await as(tx, ids.a, () => tx`select prompt_md from public.cards where topic_slug = 'rls-topic'`);
    expect("approved non-admin sees only live cards", approvedCards.length === 1 && approvedCards[0].prompt_md === "live card");
    const writeContent = await as(tx, ids.a, async () => {
      try {
        await tx.savepoint(async (sp) => {
          await sp`insert into public.topics (slug, domain, name) values ('rls-hack', 'dsa', 'x')`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    expect("approved user cannot write content", writeContent === "blocked");

    // Check-ins: owner sees own note, friend sees the row without the note.
    await as(tx, ids.a, () => tx`insert into public.checkins (user_id, problem_slug, result, minutes, note)
                                 values (${ids.a}, 'rls-problem', 'solved', 30, 'private note')`);
    const ownRows = await as(tx, ids.a, () => tx`select note from public.checkins where user_id = ${ids.a}`);
    expect("owner reads own check-in with note", ownRows.length === 1 && ownRows[0].note === "private note");
    const friendBase = await as(tx, ids.b, () => tx`select * from public.checkins where user_id = ${ids.a}`);
    expect("friend cannot read the check-ins table directly", friendBase.length === 0);
    const friendView = await as(tx, ids.b, () => tx`select * from public.checkins_public where user_id = ${ids.a}`);
    expect("friend reads the check-in through checkins_public", friendView.length === 1);
    expect("checkins_public has no note column", friendView.length === 1 && !("note" in friendView[0]));
    const pendingView = await as(tx, ids.p, () => tx`select * from public.checkins_public where user_id = ${ids.a}`);
    expect("pending user reads nothing from checkins_public", pendingView.length === 0);
    const forge = await as(tx, ids.b, async () => {
      try {
        await tx.savepoint(async (sp) => {
          await sp`insert into public.checkins (user_id, problem_slug, result) values (${ids.a}, 'rls-problem', 'failed')`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    expect("user cannot write a check-in for someone else", forge === "blocked");

    // Approvals: users can't approve themselves; admins can decide.
    const selfApprove = await as(tx, ids.p, () =>
      tx`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${ids.p} returning user_id`);
    expect("pending user cannot approve themselves", selfApprove.length === 0);
    await tx`update public.user_approvals set is_admin = true where user_id = ${ids.a}`;
    const adminApprove = await as(tx, ids.a, () =>
      tx`update public.user_approvals set status = 'approved', decided_at = now(), decided_by = ${ids.a} where user_id = ${ids.p} returning user_id`);
    expect("admin can approve a pending user", adminApprove.length === 1);

    // Profiles: approved users see each other; nobody edits someone else's.
    const friendProfile = await as(tx, ids.b, () => tx`select name from public.profiles where user_id = ${ids.a}`);
    expect("approved user reads a friend's profile", friendProfile.length === 1);
    const editFriend = await as(tx, ids.b, () =>
      tx`update public.profiles set name = 'hacked' where user_id = ${ids.a} returning user_id`);
    expect("user cannot edit a friend's profile", editFriend.length === 0);

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
console.log("\nAll RLS checks passed");
