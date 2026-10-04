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

// The one row a query must return (an insert ... returning, a count).
function one<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) throw new Error("expected a row");
  return row;
}

const ROLLBACK = new Error("rollback");

try {
  await sql.begin(async (tx) => {
    // Five users: approved A, approved friend B, approved non-friend C, pending P,
    // and approved D — a friend of B but not of A, for the transitive case.
    const ids = {
      a: "00000000-0000-4000-8000-00000000000a",
      b: "00000000-0000-4000-8000-00000000000b",
      c: "00000000-0000-4000-8000-00000000000c",
      p: "00000000-0000-4000-8000-00000000000d",
      d: "00000000-0000-4000-8000-00000000000e",
    };
    for (const [key, id] of Object.entries(ids)) {
      await tx`insert into auth.users (id, email, aud, role, raw_user_meta_data)
               values (${id}, ${`rls-${key}@example.test`}, 'authenticated', 'authenticated',
                       ${tx.json({ full_name: `RLS ${key}` })})`;
    }
    const approvals = await tx`select user_id, status from public.user_approvals where user_id in ${tx(Object.values(ids))}`;
    expect("trigger creates a pending approval per new user", approvals.length === 5 && approvals.every((r) => r.status === "pending"));
    const profiles = await tx`select count(*)::int as n from public.profiles where user_id in ${tx(Object.values(ids))}`;
    expect("trigger creates a profile per new user", one(profiles).n === 5);

    await tx`update public.user_approvals set status = 'approved', decided_at = now() where user_id in ${tx([ids.a, ids.b, ids.c, ids.d])}`;
    // A–B, A–P (pending), and B–D. A and D share a friend but are not friends.
    await tx`insert into public.friendships (user_a, user_b) values (${ids.a}, ${ids.b}), (${ids.a}, ${ids.p}), (${ids.b}, ${ids.d})`;

    // Content rows to read.
    await tx`insert into public.sources (id, name, domain, role) values ('rls-src', 'RLS source', 'dsa', 'cards')`;
    await tx`insert into public.topics (slug, domain, name) values ('rls-topic', 'dsa', 'RLS topic')`;
    await tx`insert into public.problems (slug, kind, title, difficulty, pattern_slug, source_id)
             values ('rls-problem', 'leetcode', 'RLS problem', 'Easy', 'rls-topic', 'rls-src')`;
    const batch = one(await tx`insert into public.card_batches (domain, status) values ('dsa', 'draft') returning id`);
    await tx`insert into public.cards (batch_id, topic_slug, format, prompt_md, answer_md, status)
             values (${batch.id}, 'rls-topic', 'typed', 'draft card', 'x', 'draft'),
                    (${batch.id}, 'rls-topic', 'typed', 'live card', 'x', 'live')`;

    // Content visibility.
    const anonProblems = await as(tx, null, () => tx`select slug from public.problems where slug = 'rls-problem'`);
    expect("anonymous user reads no problems", anonProblems.length === 0);
    const pendingProblems = await as(tx, ids.p, () => tx`select slug from public.problems where slug = 'rls-problem'`);
    expect("pending user reads no problems", pendingProblems.length === 0);
    const approvedProblems = await as(tx, ids.a, () => tx`select slug from public.problems where slug = 'rls-problem'`);
    expect("approved user reads problems", approvedProblems.length === 1);
    const approvedCards = await as(tx, ids.a, () => tx`select prompt_md from public.cards where topic_slug = 'rls-topic'`);
    expect("approved non-admin sees only live cards", approvedCards.length === 1 && approvedCards[0]?.prompt_md === "live card");
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
    const checkin = one(
      await as(
        tx,
        ids.a,
        () => tx`insert into public.checkins (user_id, problem_slug, result, minutes)
                                                  values (${ids.a}, 'rls-problem', 'solved', 30) returning id`,
      ),
    );
    await as(
      tx,
      ids.a,
      () => tx`insert into public.checkin_notes (checkin_id, user_id, note)
                                 values (${checkin.id}, ${ids.a}, 'private note')`,
    );
    const ownNote = await as(tx, ids.a, () => tx`select note from public.checkin_notes where checkin_id = ${checkin.id}`);
    expect("owner reads own check-in note", ownNote.length === 1 && ownNote[0]?.note === "private note");
    const friendRows = await as(tx, ids.b, () => tx`select * from public.checkins where user_id = ${ids.a}`);
    expect("approved friend reads the check-in", friendRows.length === 1);
    expect("checkins has no note column", friendRows.length === 1 && !("note" in one(friendRows)));
    const nonFriendRows = await as(tx, ids.c, () => tx`select * from public.checkins where user_id = ${ids.a}`);
    expect("approved non-friend reads no check-ins", nonFriendRows.length === 0);
    const friendNote = await as(tx, ids.b, () => tx`select note from public.checkin_notes where checkin_id = ${checkin.id}`);
    expect("friend cannot read the note", friendNote.length === 0);
    const pendingRows = await as(tx, ids.p, () => tx`select * from public.checkins where user_id = ${ids.a}`);
    expect("pending user reads no check-ins even with a friendship row", pendingRows.length === 0);
    const pendingProfile = await as(tx, ids.p, () => tx`select name from public.profiles where user_id = ${ids.a}`);
    expect("a pending friend reads no profile", pendingProfile.length === 0);
    const noView = await tx`select count(*)::int as n from pg_views where schemaname = 'public' and viewname = 'checkins_public'`;
    expect("definer-rights view is gone", one(noView).n === 0);
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
          await sp`insert into public.checkin_notes (checkin_id, user_id, note) values (${checkin.id}, ${ids.b}, 'x')`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    expect("user cannot attach a note to someone else's check-in", forgeNote === "blocked");

    // Approvals: users can't approve themselves; admins can decide.
    const selfApprove = await as(
      tx,
      ids.p,
      () => tx`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${ids.p} returning user_id`,
    );
    expect("pending user cannot approve themselves", selfApprove.length === 0);
    await tx`update public.user_approvals set is_admin = true where user_id = ${ids.a}`;
    const adminApprove = await as(
      tx,
      ids.a,
      () =>
        tx`update public.user_approvals set status = 'approved', decided_at = now(), decided_by = ${ids.a} where user_id = ${ids.p} returning user_id`,
    );
    expect("admin can approve a pending user", adminApprove.length === 1);

    // Profiles: approved users see their friends (via the new column grants & policy);
    // nobody edits someone else's.
    const friendProfile = await as(tx, ids.b, () => tx`select name from public.profiles where user_id = ${ids.a}`);
    expect(
      "approved user reads a friend's profile but only granted columns",
      friendProfile.length === 1 && friendProfile[0]?.name === "RLS a",
    );
    const readLanguage = await as(tx, ids.b, async () => {
      try {
        await tx.savepoint(async (sp) => {
          await sp`select language from public.profiles where user_id = ${ids.a}`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    expect("cannot read ungranted columns on profiles", readLanguage === "blocked");
    const readNotifications = await as(tx, ids.b, async () => {
      try {
        await tx.savepoint(async (sp) => {
          await sp`select notifications from public.profiles where user_id = ${ids.a}`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    expect("a friend cannot read notifications", readNotifications === "blocked");
    const readLeetcode = await as(tx, ids.b, async () => {
      try {
        await tx.savepoint(async (sp) => {
          await sp`select leetcode_username from public.profiles where user_id = ${ids.a}`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    expect("a friend cannot read leetcode_username", readLeetcode === "blocked");
    const nonFriendProfile = await as(tx, ids.c, () => tx`select name from public.profiles where user_id = ${ids.a}`);
    expect("approved non-friend cannot read profile", nonFriendProfile.length === 0);
    const editFriend = await as(tx, ids.b, () => tx`update public.profiles set name = 'hacked' where user_id = ${ids.a} returning user_id`);
    expect("user cannot edit a friend's profile", editFriend.length === 0);

    // Feed: answers and card state are the answerer's own; batch verdicts are admin-only;
    // a hidden card leaves everyone's feed except admins'. (A is an admin by now, B is not.)
    const live = one(await tx`select id from public.cards where topic_slug = 'rls-topic' and status = 'live'`);
    await as(tx, ids.b, async () => {
      await tx`insert into public.card_reviews (user_id, card_id, answer, score, outcome, graded_by)
               values (${ids.b}, ${live.id}, 'x', 1, 'correct', 'match')`;
      await tx`insert into public.card_state (user_id, card_id, stability, difficulty, due_at)
               values (${ids.b}, ${live.id}, 1, 5, now())`;
    });
    const peek = await as(
      tx,
      ids.a,
      () => tx`select
        (select count(*)::int from public.card_reviews where user_id = ${ids.b}) as reviews,
        (select count(*)::int from public.card_state where user_id = ${ids.b}) as state`,
    );
    expect("nobody else reads your card answers or review state", one(peek).reviews === 0 && one(peek).state === 0);
    const verdict = async (userId: string) =>
      as(tx, userId, async () => {
        try {
          await tx.savepoint(async (sp) => {
            await sp`insert into public.batch_review_items (batch_id, card_id, verdict) values (${batch.id}, ${live.id}, 'good')`;
          });
          return "allowed";
        } catch {
          return "blocked";
        }
      });
    expect("only admins record batch verdicts", (await verdict(ids.b)) === "blocked" && (await verdict(ids.a)) === "allowed");
    await tx`update public.cards set hidden = true where id = ${live.id}`;
    const hiddenForB = await as(tx, ids.b, () => tx`select id from public.cards where id = ${live.id}`);
    const hiddenForA = await as(tx, ids.a, () => tx`select id from public.cards where id = ${live.id}`);
    expect("a hidden card leaves the feed but admins still see it", hiddenForB.length === 0 && hiddenForA.length === 1);

    // App settings are server-only: not even an approved admin reads or writes them over the API roles.
    await tx`insert into public.app_settings (key, value) values ('ai_paused', 'false'::jsonb) on conflict (key) do nothing`;
    const settingsAccess = async (userId: string, statement: "read" | "write") =>
      as(tx, userId, async () => {
        try {
          await tx.savepoint(async (sp) => {
            if (statement === "read") await sp`select key from public.app_settings`;
            else await sp`update public.app_settings set value = 'true'::jsonb where key = 'ai_paused'`;
          });
          return "allowed";
        } catch {
          return "blocked";
        }
      });
    expect(
      "settings are not readable or writable over the API, even by an admin",
      (await settingsAccess(ids.a, "read")) === "blocked" &&
        (await settingsAccess(ids.a, "write")) === "blocked" &&
        (await settingsAccess(ids.b, "read")) === "blocked",
    );

    // Opened lessons are each reader's own, like studied ones: not even a friend sees them.
    await tx`insert into public.topic_opens (user_id, topic_slug) values (${ids.a}, 'rls-topic')`;
    const opensFor = (userId: string) => as(tx, userId, () => tx`select user_id from public.topic_opens where topic_slug = 'rls-topic'`);
    const openFor = async (userId: string, owner: string) =>
      as(tx, userId, async () => {
        try {
          await tx.savepoint((sp) => sp`insert into public.topic_opens (user_id, topic_slug) values (${owner}, 'rls-topic')`);
          return "allowed";
        } catch {
          return "blocked";
        }
      });
    // P was approved above; put them back to pending for this one case.
    await tx`update public.user_approvals set status = 'pending', decided_at = null where user_id = ${ids.p}`;
    const pendingOpen = await openFor(ids.p, ids.p);
    await tx`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${ids.p}`;
    expect(
      "opened lessons are owner-only, and only approved users record their own",
      (await opensFor(ids.a)).length === 1 &&
        (await opensFor(ids.b)).length === 0 &&
        (await openFor(ids.b, ids.c)) === "blocked" &&
        pendingOpen === "blocked" &&
        (await openFor(ids.c, ids.c)) === "allowed",
    );

    // Coach: each user's coach is theirs alone; friends see only mock scores.
    await as(tx, ids.a, async () => {
      const thread = one(await tx`insert into public.coach_threads (user_id, title) values (${ids.a}, 'mine') returning id`);
      await tx`insert into public.coach_messages (thread_id, user_id, role, parts) values (${thread.id}, ${ids.a}, 'user', '[]')`;
      await tx`insert into public.coach_memory (user_id, kind, text) values (${ids.a}, 'habit', 'rushes edge cases')`;
      await tx`insert into public.stories (user_id, title) values (${ids.a}, 'Outage story')`;
      const mock = one(
        await tx`insert into public.mocks (user_id, type, topic, status, score) values (${ids.a}, 'design', 'url shortener', 'done', 71) returning id`,
      );
      await tx`insert into public.mock_details (mock_id, user_id, prompt) values (${mock.id}, ${ids.a}, 'secret transcript')`;
    });
    const coachPeek = one(
      await as(
        tx,
        ids.b,
        () => tx`select
        (select count(*)::int from public.coach_threads where user_id = ${ids.a}) as threads,
        (select count(*)::int from public.coach_messages where user_id = ${ids.a}) as messages,
        (select count(*)::int from public.coach_memory where user_id = ${ids.a}) as memory,
        (select count(*)::int from public.stories where user_id = ${ids.a}) as stories,
        (select count(*)::int from public.mock_details where user_id = ${ids.a}) as details,
        (select count(*)::int from public.mocks where user_id = ${ids.a}) as mocks`,
      ),
    );
    expect(
      "a friend can't read your coach threads, messages, memory, stories or mock transcripts",
      coachPeek.threads === 0 && coachPeek.messages === 0 && coachPeek.memory === 0 && coachPeek.stories === 0 && coachPeek.details === 0,
    );
    expect("a friend sees your mock score", coachPeek.mocks === 1);
    const nonFriendMocks = await as(tx, ids.c, () => tx`select count(*)::int as n from public.mocks where user_id = ${ids.a}`);
    expect("non-friend sees no mock scores", one(nonFriendMocks).n === 0);
    const intrude = await as(tx, ids.b, async () => {
      try {
        await tx.savepoint(async (sp) => {
          const t = one(await sp`select id from public.coach_threads where user_id = ${ids.a} limit 1`);
          await sp`insert into public.coach_messages (thread_id, user_id, role) values (${t.id}, ${ids.b}, 'user')`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    expect("you can't post into someone else's coach thread", intrude === "blocked");

    // Tracker: friends see days, campaigns and readiness; missions, reviews and push stay private.
    const campaign = one(
      await as(
        tx,
        ids.a,
        () => tx`insert into public.campaigns (user_id, start_date, length_days, templates)
                                                   values (${ids.a}, '2026-09-01', 90, '{}') returning id`,
      ),
    );
    await as(tx, ids.a, async () => {
      await tx`insert into public.days (user_id, date, campaign_id, status) values (${ids.a}, '2026-09-01', ${campaign.id}, 'done')`;
      await tx`insert into public.missions (user_id, date, slot_type, ref, est_minutes) values (${ids.a}, '2026-09-01', 'new_problem', 'rls-problem', 40)`;
      await tx`insert into public.problem_reviews (user_id, problem_slug, step, due_date) values (${ids.a}, 'rls-problem', 1, '2026-09-04')`;
      await tx`insert into public.readiness_snapshots (user_id, date, overall) values (${ids.a}, '2026-09-01', 40)`;
      await tx`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (${ids.a}, 'https://push.example.test/a', 'k', 'a')`;
    });
    const friendView = await as(
      tx,
      ids.b,
      () => tx`select
        (select count(*)::int from public.days where user_id = ${ids.a}) as days,
        (select count(*)::int from public.campaigns where user_id = ${ids.a}) as campaigns,
        (select count(*)::int from public.readiness_snapshots where user_id = ${ids.a}) as readiness,
        (select count(*)::int from public.missions where user_id = ${ids.a}) as missions,
        (select count(*)::int from public.problem_reviews where user_id = ${ids.a}) as reviews,
        (select count(*)::int from public.push_subscriptions where user_id = ${ids.a}) as push`,
    );
    const f = one(friendView);
    expect("friend reads days, campaign and readiness", f.days === 1 && f.campaigns === 1 && f.readiness === 1);
    expect("friend cannot read missions, reviews or push", f.missions === 0 && f.reviews === 0 && f.push === 0);
    const nonFriendView = await as(
      tx,
      ids.c,
      () => tx`select
        (select count(*)::int from public.days where user_id = ${ids.a}) as days,
        (select count(*)::int from public.campaigns where user_id = ${ids.a}) as campaigns,
        (select count(*)::int from public.readiness_snapshots where user_id = ${ids.a}) as readiness`,
    );
    const nf = one(nonFriendView);
    expect("non-friend reads no days, campaigns or readiness", nf.days === 0 && nf.campaigns === 0 && nf.readiness === 0);
    const anonDays = await as(tx, null, () => tx`select count(*)::int as n from public.days where user_id = ${ids.a}`);
    expect("anonymous user reads no days", one(anonDays).n === 0);
    const tamper = await as(tx, ids.b, () => tx`update public.days set status = 'missed' where user_id = ${ids.a} returning date`);
    expect("friend cannot change someone else's day", tamper.length === 0);

    // Transitive visibility: A–B and B–D are friends; A and D are not. A reading
    // D's rows must return nothing, and B reading the same rows must return them —
    // the second half is what proves the fixture is a real friend-of-friend rather
    // than an ACL that simply blocks everything.
    const dCampaign = one(
      await as(
        tx,
        ids.d,
        () => tx`insert into public.campaigns (user_id, start_date, length_days, templates)
                                                   values (${ids.d}, '2026-09-01', 90, '{}') returning id`,
      ),
    );
    await as(tx, ids.d, async () => {
      await tx`insert into public.checkins (user_id, problem_slug, result, minutes) values (${ids.d}, 'rls-problem', 'solved', 25)`;
      await tx`insert into public.days (user_id, date, campaign_id, status) values (${ids.d}, '2026-09-01', ${dCampaign.id}, 'done')`;
      await tx`insert into public.readiness_snapshots (user_id, date, overall) values (${ids.d}, '2026-09-01', 55)`;
      await tx`insert into public.mocks (user_id, type, topic, status, score) values (${ids.d}, 'design', 'url shortener', 'done', 60)`;
    });
    const peekAtD = (viewer: string) =>
      as(
        tx,
        viewer,
        () => tx`select
          (select count(*)::int from public.checkins where user_id = ${ids.d}) as checkins,
          (select count(*)::int from public.days where user_id = ${ids.d}) as days,
          (select count(*)::int from public.campaigns where user_id = ${ids.d}) as campaigns,
          (select count(*)::int from public.readiness_snapshots where user_id = ${ids.d}) as readiness,
          (select count(*)::int from public.mocks where user_id = ${ids.d}) as mocks,
          (select count(*)::int from public.profiles where user_id = ${ids.d}) as profiles`,
      );
    const strangerToD = one(await peekAtD(ids.a));
    expect(
      "a friend of a friend reads none of their check-ins, days, campaign, readiness, mocks or profile",
      strangerToD.checkins === 0 &&
        strangerToD.days === 0 &&
        strangerToD.campaigns === 0 &&
        strangerToD.readiness === 0 &&
        strangerToD.mocks === 0 &&
        strangerToD.profiles === 0,
      JSON.stringify(strangerToD),
    );
    const friendOfD = one(await peekAtD(ids.b));
    expect(
      "the mutual friend does read them, so the block above is friendship and not a broken fixture",
      friendOfD.checkins === 1 &&
        friendOfD.days === 1 &&
        friendOfD.campaigns === 1 &&
        friendOfD.readiness === 1 &&
        friendOfD.mocks === 1 &&
        friendOfD.profiles === 1,
      JSON.stringify(friendOfD),
    );
    const dReadsA = await as(tx, ids.d, () => tx`select count(*)::int as n from public.checkins where user_id = ${ids.a}`);
    expect("and the friend of a friend reads nothing the other way either", one(dReadsA).n === 0);

    // friend_invites: you see invites you sent and invites addressed to your
    // email, and nothing else.
    await as(tx, ids.b, () => tx`insert into public.friend_invites (email, invited_by) values (${"rls-a@example.test"}, ${ids.b})`);
    const inviteToA = await as(tx, ids.a, () => tx`select id from public.friend_invites where email = ${"rls-a@example.test"}`);
    expect("the invite is visible to the address it names", inviteToA.length === 1);
    const inviteSeenByB = await as(tx, ids.b, () => tx`select id from public.friend_invites`);
    expect("the sender sees the invite they sent", inviteSeenByB.length === 1);
    const inviteToStranger = await as(tx, ids.c, () => tx`select id from public.friend_invites`);
    expect("friend_invites addressed to someone else are invisible", inviteToStranger.length === 0);

    // The user_a < user_b check rejects a reversed pair. Run as the table owner
    // (not the authenticated role) so RLS — which has no insert policy on
    // friendships — is not what blocks it; the check constraint must be.
    const reversed = await (async () => {
      try {
        await tx.savepoint(async (sp) => {
          await sp`insert into public.friendships (user_a, user_b) values (${ids.b}, ${ids.a})`;
        });
        return "allowed";
      } catch {
        return "blocked";
      }
    })();
    expect("a reversed pair (user_a > user_b) is rejected", reversed === "blocked");

    // Since 20260929000023 the write grants are gone too, so a client write now
    // fails on a privilege it does not hold before RLS is even consulted. The
    // reversed-pair test above runs as the owner on purpose; this is the
    // authenticated side of the same door.
    const friendshipsWrites = one(
      await tx`select
        has_table_privilege('authenticated', 'public.friendships', 'insert') as ins,
        has_table_privilege('authenticated', 'public.friendships', 'update') as upd,
        has_table_privilege('authenticated', 'public.friendships', 'delete') as del`,
    );
    expect(
      "authenticated has no write grant on friendships, so a forged pair fails on privilege too",
      friendshipsWrites.ins === false && friendshipsWrites.upd === false && friendshipsWrites.del === false,
      JSON.stringify(friendshipsWrites),
    );

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
