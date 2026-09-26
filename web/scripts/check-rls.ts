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

    // Check-ins: friends read rows directly; the note lives in checkin_notes, owner-only.
    const checkin = await as(tx, ids.a, () => tx`insert into public.checkins (user_id, problem_slug, result, minutes)
                                                  values (${ids.a}, 'rls-problem', 'solved', 30) returning id`);
    await as(tx, ids.a, () => tx`insert into public.checkin_notes (checkin_id, user_id, note)
                                 values (${checkin[0].id}, ${ids.a}, 'private note')`);
    const ownNote = await as(tx, ids.a, () => tx`select note from public.checkin_notes where checkin_id = ${checkin[0].id}`);
    expect("owner reads own check-in note", ownNote.length === 1 && ownNote[0].note === "private note");
    const friendRows = await as(tx, ids.b, () => tx`select * from public.checkins where user_id = ${ids.a}`);
    expect("approved friend reads the check-in", friendRows.length === 1);
    expect("checkins has no note column", friendRows.length === 1 && !("note" in friendRows[0]));
    const friendNote = await as(tx, ids.b, () => tx`select note from public.checkin_notes where checkin_id = ${checkin[0].id}`);
    expect("friend cannot read the note", friendNote.length === 0);
    const pendingRows = await as(tx, ids.p, () => tx`select * from public.checkins where user_id = ${ids.a}`);
    expect("pending user reads no check-ins", pendingRows.length === 0);
    const noView = await tx`select count(*)::int as n from pg_views where schemaname = 'public' and viewname = 'checkins_public'`;
    expect("definer-rights view is gone", noView[0].n === 0);
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
    const forgeNote = await as(tx, ids.b, async () => {
      try {
        await tx.savepoint(async (sp) => {
          await sp`insert into public.checkin_notes (checkin_id, user_id, note) values (${checkin[0].id}, ${ids.b}, 'x')`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    expect("user cannot attach a note to someone else's check-in", forgeNote === "blocked");

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

    // Tracker: friends see days, campaigns and readiness; missions, reviews and push stay private.
    const campaign = await as(tx, ids.a, () => tx`insert into public.campaigns (user_id, start_date, length_days, templates)
                                                   values (${ids.a}, '2026-09-01', 90, '{}') returning id`);
    await as(tx, ids.a, async () => {
      await tx`insert into public.days (user_id, date, campaign_id, status) values (${ids.a}, '2026-09-01', ${campaign[0].id}, 'done')`;
      await tx`insert into public.missions (user_id, date, slot_type, ref, est_minutes) values (${ids.a}, '2026-09-01', 'new_problem', 'rls-problem', 40)`;
      await tx`insert into public.problem_reviews (user_id, problem_slug, step, due_date) values (${ids.a}, 'rls-problem', 1, '2026-09-04')`;
      await tx`insert into public.readiness_snapshots (user_id, date, overall) values (${ids.a}, '2026-09-01', 40)`;
      await tx`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (${ids.a}, 'https://push.example.test/a', 'k', 'a')`;
    });
    const friendView = await as(tx, ids.b, () => tx`select
        (select count(*)::int from public.days where user_id = ${ids.a}) as days,
        (select count(*)::int from public.campaigns where user_id = ${ids.a}) as campaigns,
        (select count(*)::int from public.readiness_snapshots where user_id = ${ids.a}) as readiness,
        (select count(*)::int from public.missions where user_id = ${ids.a}) as missions,
        (select count(*)::int from public.problem_reviews where user_id = ${ids.a}) as reviews,
        (select count(*)::int from public.push_subscriptions where user_id = ${ids.a}) as push`);
    const f = friendView[0];
    expect("friend reads days, campaign and readiness", f.days === 1 && f.campaigns === 1 && f.readiness === 1);
    expect("friend cannot read missions, reviews or push", f.missions === 0 && f.reviews === 0 && f.push === 0);
    const pendingDays = await as(tx, null, () => tx`select count(*)::int as n from public.days where user_id = ${ids.a}`);
    expect("anonymous user reads no days", pendingDays[0].n === 0);
    const tamper = await as(tx, ids.b, () =>
      tx`update public.days set status = 'missed' where user_id = ${ids.a} returning date`);
    expect("friend cannot change someone else's day", tamper.length === 0);

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
