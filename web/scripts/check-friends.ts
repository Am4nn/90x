// Checks the friends logic against the real database. Everything runs in
// one transaction that is always rolled back. Run with `bun run check:friends`.

import { count, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { friendInvites, friendships } from "@/db/schema";
import { orderedPair } from "@/lib/friends/pairs";
import {
  accept,
  dismiss,
  friendIds,
  invite,
  INVITE_CAP,
  INVITES_PER_ADDRESS,
  pendingFor,
  refuse,
  revoke,
  sentBy,
  unfriend,
} from "@/lib/friends/service";

// A check must never send real email: with these unset, sendEmail throws and
// sendEmailBestEffort swallows it, so a rolled-back invite leaves no trace.
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;

const failures: string[] = [];
function expect(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
}

const users = [
  "00000000-0000-4000-8000-0000000000f1", // Sender
  "00000000-0000-4000-8000-0000000000f2", // Recipient 1
  "00000000-0000-4000-8000-0000000000f3", // Recipient 2
] as const;

const [u1, u2, u3] = users;

const ROLLBACK = new Error("rollback");

try {
  await db.transaction(async (tx) => {
    // Setup: three approved users, emails derived from the uuid suffix.
    for (const id of users) {
      await tx.execute(
        sql`insert into auth.users (id, email, aud, role, raw_user_meta_data)
            values (${id}, ${`friend-${id.slice(-2)}@example.test`}, 'authenticated', 'authenticated', '{"full_name": "Test"}'::jsonb)`,
      );
      await tx.execute(sql`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${id}`);
    }

    // Scoped to this check's own three users. It used to count every row in the
    // table, which was true while nobody had friends and started failing the day two
    // real people accepted an invite: the assertions read `=== 1`, and the table held
    // one real friendship plus this one. A gate that fails because the app is being
    // used is a gate somebody switches off.
    const countFriendships = async () => {
      const [row] = await tx
        .select({ n: count() })
        .from(friendships)
        .where(or(inArray(friendships.userA, users), inArray(friendships.userB, users)));
      return row?.n ?? 0;
    };

    // A fresh user sees only themselves.
    const f1 = await friendIds(u1, tx);
    expect("friendIds includes yourself", f1.length === 1 && f1[0] === u1);

    // Invite → pending appears for that email only.
    await invite(u1, "friend-f2@example.test", tx);
    const sent = await sentBy(u1, tx);
    expect("invite creates a pending row", sent.length === 1 && sent[0]?.status === "pending");
    const pending = await pendingFor("friend-f2@example.test", tx);
    expect("pendingFor lists it for that email", pending.length === 1 && pending[0]?.id === sent[0]?.id);
    expect("pendingFor does not list it for another email", (await pendingFor("other@example.test", tx)).length === 0);

    // A repeat invite is a silent no-op.
    await invite(u1, "friend-f2@example.test", tx);
    expect("repeat invite inserts nothing", (await sentBy(u1, tx)).length === 1);

    // Acting on an invite with the wrong email throws and changes nothing.
    const inviteId = pending[0]!.id;
    const wrongEmail = await accept(inviteId, u2, "someone-else@example.test", tx).catch((e) => (e as Error).message);
    expect("accept with a different email throws", wrongEmail === "Invite is for a different email.");
    expect("the wrong-email accept changed nothing", (await sentBy(u1, tx))[0]?.status === "pending");

    // Accept creates exactly one friendship row, symmetric.
    await accept(inviteId, u2, "friend-f2@example.test", tx);
    expect("accept marks it accepted", (await sentBy(u1, tx))[0]?.status === "accepted");
    expect("accept creates exactly one friendship row", (await countFriendships()) === 1);
    const f1After = await friendIds(u1, tx);
    const f2After = await friendIds(u2, tx);
    expect("friendship is symmetric", f1After.includes(u2) && f2After.includes(u1));

    // Accepting again is a no-op: no second friendship row.
    const secondAccept = await accept(inviteId, u2, "friend-f2@example.test", tx).catch((e) => (e as Error).message);
    expect("accepting twice does not duplicate", secondAccept === "Invite is no longer pending." && (await countFriendships()) === 1);

    // The two nonsense invites.
    const friendFail = await invite(u1, "friend-f2@example.test", tx).catch((e) => (e as Error).message);
    expect("cannot invite an existing friend", String(friendFail).startsWith("You are already friends with"));
    const selfFail = await invite(u1, "friend-f1@example.test", tx).catch((e) => (e as Error).message);
    expect("cannot invite yourself", selfFail === "You cannot invite yourself.");

    // Unfriend removes the link, direction-independent.
    await unfriend(u2, u1, tx);
    expect("unfriend removes the link", !(await friendIds(u1, tx)).includes(u2) && (await countFriendships()) === 0);

    // Refuse leaves no friendship.
    await invite(u1, "friend-f3@example.test", tx);
    const p3 = await pendingFor("friend-f3@example.test", tx);
    await refuse(p3[0]!.id, "friend-f3@example.test", tx);
    expect("refuse marks it revoked", (await sentBy(u1, tx)).find((i) => i.id === p3[0]!.id)?.status === "revoked");
    expect("refuse leaves no friendship", (await countFriendships()) === 0);

    // Dismiss keeps it pending but unlisted for the recipient.
    await tx.delete(friendInvites).where(eq(friendInvites.id, p3[0]!.id));
    await invite(u1, "friend-f3@example.test", tx);
    const p3New = await pendingFor("friend-f3@example.test", tx);
    await dismiss(p3New[0]!.id, "friend-f3@example.test", tx);
    expect("dismiss hides it from the recipient's list", (await pendingFor("friend-f3@example.test", tx)).length === 0);
    expect("dismiss leaves it pending for the sender", (await sentBy(u1, tx)).find((i) => i.id === p3New[0]!.id)?.status === "pending");

    // Revoke.
    await tx.delete(friendInvites).where(eq(friendInvites.id, p3New[0]!.id));
    await invite(u1, "friend-f3@example.test", tx);
    const toRevoke = await pendingFor("friend-f3@example.test", tx);
    await revoke(toRevoke[0]!.id, u1, tx);
    expect("revoke marks it revoked", (await sentBy(u1, tx)).find((i) => i.id === toRevoke[0]!.id)?.status === "revoked");

    // A re-invite puts a dismissed invite back in front of the recipient. Before
    // this, dismiss left status 'pending' so the unique index swallowed the
    // re-invite, no email went, and the UI still said "Invite sent." - a dead
    // end that reported success.
    await invite(u1, "revive@example.test", tx);
    const toDismiss = await pendingFor("revive@example.test", tx);
    await dismiss(toDismiss[0]!.id, "revive@example.test", tx);
    expect("a dismissed invite is not listed", (await pendingFor("revive@example.test", tx)).length === 0);
    await invite(u1, "revive@example.test", tx);
    expect("re-inviting un-dismisses it, so the recipient sees it again", (await pendingFor("revive@example.test", tx)).length === 1);

    // Refusing and revoking both free a cap slot, so the per-sender cap alone let
    // invite -> revoke -> invite send unbounded mail to one address.
    for (let i = 0; i < INVITES_PER_ADDRESS; i++) {
      const open = await pendingFor("spammed@example.test", tx);
      if (open[0]) await revoke(open[0].id, u1, tx);
      await invite(u1, "spammed@example.test", tx).catch(() => {});
    }
    const spamFail = await invite(u1, "spammed@example.test", tx).catch((e) => (e as Error).message);
    expect(
      `one address takes at most ${INVITES_PER_ADDRESS} invites from one sender`,
      spamFail === `You have already invited spammed@example.test ${INVITES_PER_ADDRESS} times. Ask them another way.`,
      String(spamFail),
    );

    // The cap refuses past 20 pending invites per sender.
    for (let i = 0; i < INVITE_CAP; i++) {
      await tx.insert(friendInvites).values({ email: `cap-${i}@example.test`, invitedBy: u1 });
    }
    const capFail = await invite(u1, "one-too-many@example.test", tx).catch((e) => (e as Error).message);
    expect("the cap refuses past 20", capFail === `You have ${INVITE_CAP} pending invites. Revoke one before sending another.`);

    // Friends of friends are not friends. u1–u2 and u2–u3 are pairs, so u1 must
    // not reach u3 through u2. `friendIds` is what every cross-user server query
    // filters on, so this is the transitive guarantee in one place.
    const [u1u2, u2u3] = [orderedPair(u1, u2), orderedPair(u2, u3)];
    await tx.insert(friendships).values([
      { userA: u1u2[0], userB: u1u2[1] },
      { userA: u2u3[0], userB: u2u3[1] },
    ]);
    const fromU1 = await friendIds(u1, tx);
    const fromU2 = await friendIds(u2, tx);
    const fromU3 = await friendIds(u3, tx);
    expect(
      "a friend of a friend is not a friend: u1 sees u2 but not u3",
      fromU1.includes(u2) && !fromU1.includes(u3),
      JSON.stringify(fromU1),
    );
    expect("and u3 sees u2 but not u1", fromU3.includes(u2) && !fromU3.includes(u1), JSON.stringify(fromU3));
    expect("the middle friend sees both", fromU2.includes(u1) && fromU2.includes(u3), JSON.stringify(fromU2));

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
console.log("\nAll friend checks passed");
process.exit(0);
