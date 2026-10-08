import "server-only";
import { and, count, eq, getTableColumns, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { friendInvites, friendships, profiles } from "@/db/schema";
import { sendEmailBestEffort } from "@/lib/email";
import { friendInviteEmail } from "@/lib/email/templates";
import type { Db } from "@/lib/tracker/service";
import { normalizeInviteEmail } from "./invite-email";
import { collectFriendIds, orderedPair } from "./pairs";

// Friends service. Mirrors Curfew's inviteToGroup logic, retargeted from a
// group to a pair. The invite row IS the request; the email is a nudge.

/** Maximum pending invites a single sender may have at once. */
/** How many invites one sender may ever send to one address, refusals included.
 *  A refused invite must not simply be re-sendable forever: the recipient has no
 *  other way to stop it, because refusing is what frees the cap slot. */
export const INVITES_PER_ADDRESS = 3;

export const INVITE_CAP = 20;

/** A pending invite older than this can no longer be accepted, and its recipient no longer sees it. An address
 *  can change hands (a work address reissued), and an invite should not wait months for whoever holds it next.
 *  Checked at read time, so nothing has to sweep old rows. A re-invite from the sender starts it over. */
export const INVITE_TTL_DAYS = 30;

/** True for an invite still inside INVITE_TTL_DAYS. */
const fresh = () => sql`${friendInvites.createdAt} > now() - make_interval(days => ${INVITE_TTL_DAYS})`;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type PendingInvite = {
  id: string;
  inviterName: string;
  createdAt: string;
};

/**
 * Pending invites addressed to this email that the recipient has not dismissed.
 * This is what their dashboard lists.
 */
export async function pendingFor(email: string, q: Db = db): Promise<PendingInvite[]> {
  const rows = await q
    .select({
      id: friendInvites.id,
      inviterName: profiles.name,
      createdAt: friendInvites.createdAt,
    })
    .from(friendInvites)
    .innerJoin(profiles, eq(profiles.userId, friendInvites.invitedBy))
    .where(
      and(
        eq(friendInvites.email, email.toLowerCase()),
        eq(friendInvites.status, "pending"),
        isNull(friendInvites.dismissedAt),
        fresh(),
        // Two people can invite each other before either accepts. Once one is
        // accepted they are friends, and the other invite would still read "X
        // wants to compare progress" about somebody already on the scoreboard -
        // and accepting it would silently no-op on the friendships conflict.
        //
        // The recipient's id comes from the address rather than a new parameter:
        // this runs on the server connection, so there is no auth.uid() to read,
        // and threading a viewer id through would change every call site for a
        // card that is only cosmetically wrong.
        sql`not exists (
          select 1 from public.friendships f, auth.users u
          where lower(u.email) = ${friendInvites.email}
            and f.user_a = least(${friendInvites.invitedBy}, u.id)
            and f.user_b = greatest(${friendInvites.invitedBy}, u.id)
        )`,
      ),
    )
    .orderBy(friendInvites.createdAt);
  return rows;
}

export type SentInvite = {
  id: string;
  email: string;
  status: string;
  createdAt: string;
  respondedAt: string | null;
};

/** Invites the viewer has sent, newest first. */
export async function sentBy(inviterId: string, q: Db = db): Promise<SentInvite[]> {
  return q
    .select({
      id: friendInvites.id,
      email: friendInvites.email,
      status: friendInvites.status,
      createdAt: friendInvites.createdAt,
      respondedAt: friendInvites.respondedAt,
    })
    .from(friendInvites)
    .where(eq(friendInvites.invitedBy, inviterId))
    .orderBy(sql`${friendInvites.createdAt} desc`);
}

/**
 * Returns all user ids that the viewer can see on the scoreboard, including
 * the viewer themselves. Callers replace `innerJoin(userApprovals…)` with
 * `inArray(x.userId, ids)` — the viewer is included so no extra `or
 * user_id = viewerId` clause is needed.
 */
export async function friendIds(viewerId: string, q: Db = db): Promise<string[]> {
  const rows = await q
    .select({ userA: friendships.userA, userB: friendships.userB })
    .from(friendships)
    .where(sql`${friendships.userA} = ${viewerId} or ${friendships.userB} = ${viewerId}`);
  return collectFriendIds(viewerId, rows);
}

/** The viewer's friends, excluding the viewer — the people whose activity you see. */
export async function otherFriendIds(viewerId: string, q: Db = db): Promise<string[]> {
  return (await friendIds(viewerId, q)).filter((id) => id !== viewerId);
}

/** True if the two users are already friends (order-independent). */
async function areFriends(a: string, b: string, q: Db = db): Promise<boolean> {
  const [lo, hi] = orderedPair(a, b);
  const [row] = await q
    .select({ n: count() })
    .from(friendships)
    .where(and(eq(friendships.userA, lo), eq(friendships.userB, hi)));
  return (row?.n ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Send a friend invite. Guards the two nonsense cases (self, already friends).
 * A repeat invite is a silent no-op (the unique index handles it).
 * Caps at INVITE_CAP pending invites per sender.
 */
/**
 * What an invite did, so the caller can say which. A fresh invite and a re-invite
 * after a dismissal both send; an address that already has a visible pending
 * invite sends nothing, because one is already waiting there.
 */
export type InviteOutcome = "sent" | "resent" | "already-pending";

export async function invite(inviterId: string, rawEmail: string, q: Db = db): Promise<InviteOutcome> {
  const email = normalizeInviteEmail(rawEmail);

  // If the address already has an account, guard the two nonsense cases.
  const [existing] = await q.execute(sql`select id from auth.users where lower(email) = ${email}`);
  if (existing) {
    const row = existing as { id: string };
    if (row.id === inviterId) throw new Error("You cannot invite yourself.");
    if (await areFriends(inviterId, row.id, q)) throw new Error(`You are already friends with ${email}.`);
  }

  // Cap and insert in one transaction, under a lock on the sender's profile row,
  // so two concurrent invites cannot both read 19 and then both insert.
  const [row] = await q.transaction(async (tx) => {
    await tx.execute(sql`select 1 from public.profiles where user_id = ${inviterId} for update`);
    const [capRow] = await tx
      .select({ n: count() })
      .from(friendInvites)
      .where(and(eq(friendInvites.invitedBy, inviterId), eq(friendInvites.status, "pending"), fresh()));
    if ((capRow?.n ?? 0) >= INVITE_CAP) {
      throw new Error(`You have ${INVITE_CAP} pending invites. Revoke one before sending another.`);
    }
    // INVITE_CAP bounds how many invites are open at once, which is not the same
    // as how many emails one address can be sent. `refuse` and `revoke` both
    // take the row out of the partial unique index and free a cap slot, so
    // invite -> revoke -> invite was an unbounded mailer pointed at any address,
    // from a verified domain, with nothing the recipient could do about it.
    const [toThisAddress] = await tx
      .select({ n: count() })
      .from(friendInvites)
      .where(and(eq(friendInvites.invitedBy, inviterId), eq(friendInvites.email, email)));
    if ((toThisAddress?.n ?? 0) >= INVITES_PER_ADDRESS) {
      throw new Error(`You have already invited ${email} ${INVITES_PER_ADDRESS} times. Ask them another way.`);
    }
    return tx.insert(friendInvites).values({ email, invitedBy: inviterId }).onConflictDoNothing().returning({ id: friendInvites.id });
  });
  if (!row) {
    // A pending row already exists. If the recipient dismissed it, it is
    // invisible to them and invisible to this insert, so a re-invite did nothing
    // at all while the UI said "Invite sent." - a dead end that reported
    // success, recoverable only by the sender noticing a stale row and revoking
    // it. A re-invite is exactly the signal to put it back in front of them.
    // An expired invite is the same dead end: invisible, unacceptable, and in the way of a new row. A
    // re-invite starts its clock again.
    const [revived] = await q
      .update(friendInvites)
      .set({ dismissedAt: null, createdAt: sql`now()` })
      .where(
        and(
          eq(friendInvites.invitedBy, inviterId),
          eq(friendInvites.email, email),
          eq(friendInvites.status, "pending"),
          or(isNotNull(friendInvites.dismissedAt), sql`not (${fresh()})`),
        ),
      )
      .returning({ id: friendInvites.id });
    // Genuinely still pending and visible: one invite is already waiting, so
    // sending a second email would be noise.
    if (!revived) return "already-pending";
    await notifyInvitee(inviterId, email, revived.id, q);
    return "resent";
  }

  await notifyInvitee(inviterId, email, row.id, q);
  return "sent";
}

/** The invite email, for both a fresh invite and a re-invite that un-dismissed one. */
async function notifyInvitee(inviterId: string, email: string, inviteId: string, q: Db): Promise<void> {
  const [me] = await q.select({ name: profiles.name }).from(profiles).where(eq(profiles.userId, inviterId));
  await sendEmailBestEffort({
    actorId: inviterId,
    kind: "invite",
    email: friendInviteEmail(email, me?.name ?? "Someone"),
    payload: { invite_id: inviteId },
  });
}

/** Loads an invite by id, or throws. With `lock`, takes a row lock so a
 * concurrent respond waits instead of racing. */
async function requirePendingInvite(inviteId: string, q: Db, lock = false) {
  // `expired` is worked out by the database clock, the same test pendingFor uses.
  const columns = { ...getTableColumns(friendInvites), expired: sql<boolean>`not (${fresh()})` };
  const [inv] = lock
    ? await q.select(columns).from(friendInvites).where(eq(friendInvites.id, inviteId)).for("update")
    : await q.select(columns).from(friendInvites).where(eq(friendInvites.id, inviteId));
  if (!inv) throw new Error("Invite not found.");
  if (inv.status !== "pending") throw new Error("Invite is no longer pending.");
  return inv;
}

/** Moves a still-pending invite's fields. A concurrent refuse or revoke that
 * already changed the row loses: this matches nothing and throws, so accept
 * cannot overwrite a revocation and still create the friendship. */
async function updatePendingInvite(inviteId: string, fields: Partial<typeof friendInvites.$inferInsert>, q: Db): Promise<void> {
  const updated = await q
    .update(friendInvites)
    .set(fields)
    .where(and(eq(friendInvites.id, inviteId), eq(friendInvites.status, "pending")))
    .returning({ id: friendInvites.id });
  if (!updated.length) throw new Error("Invite is no longer pending.");
}

/**
 * Accept a pending invite. The invite id selects which of the invites
 * addressed to *your* email you are acting on — a leaked link is useless to
 * anyone who does not own that address.
 */
export async function accept(inviteId: string, userId: string, userEmail: string, q: Db = db): Promise<void> {
  await q.transaction(async (tx) => {
    const inv = await requirePendingInvite(inviteId, tx, true);
    if (inv.email.toLowerCase() !== userEmail.toLowerCase()) throw new Error("Invite is for a different email.");
    if (inv.expired) {
      throw new Error("This invite has expired. Ask them to send a new one.");
    }
    // Nobody can accept their own invite: `invite()` refuses a self-invite and
    // the email check above blocks the rest, so this is unreachable today. It is
    // here because the failure without it is a 500 from the `user_a < user_b`
    // constraint - orderedPair(x, x) is (x, x) - and a guard that turns an
    // unreachable crash into a sentence costs one line.
    if (inv.invitedBy === userId) throw new Error("You cannot accept your own invite.");
    await updatePendingInvite(inviteId, { status: "accepted", respondedAt: new Date().toISOString() }, tx);
    const [lo, hi] = orderedPair(inv.invitedBy, userId);
    await tx.insert(friendships).values({ userA: lo, userB: hi, fromInvite: inviteId }).onConflictDoNothing();
  });
}

/**
 * Refuse a pending invite. Sets status to 'revoked' so the sender can see it.
 */
export async function refuse(inviteId: string, userEmail: string, q: Db = db): Promise<void> {
  const inv = await requirePendingInvite(inviteId, q);
  if (inv.email.toLowerCase() !== userEmail.toLowerCase()) throw new Error("Invite is for a different email.");
  await updatePendingInvite(inviteId, { status: "revoked", respondedAt: new Date().toISOString() }, q);
}

/**
 * Dismiss a pending invite. Status stays 'pending'; dismissed_at is stamped.
 * The sender sees no change; the invite stops being listed for the recipient.
 * Someone who dismisses has decided only that they do not want to look at it.
 */
export async function dismiss(inviteId: string, userEmail: string, q: Db = db): Promise<void> {
  const inv = await requirePendingInvite(inviteId, q);
  if (inv.email.toLowerCase() !== userEmail.toLowerCase()) throw new Error("Invite is for a different email.");
  await updatePendingInvite(inviteId, { dismissedAt: new Date().toISOString() }, q);
}

/**
 * Revoke an invite the viewer sent. Sets status to 'revoked'.
 */
export async function revoke(inviteId: string, inviterId: string, q: Db = db): Promise<void> {
  const inv = await requirePendingInvite(inviteId, q);
  if (inv.invitedBy !== inviterId) throw new Error("That is not your invite.");
  await updatePendingInvite(inviteId, { status: "revoked", respondedAt: new Date().toISOString() }, q);
}

/**
 * Account deletion: every invite addressed to this person's email, in any state. Their own
 * sent invites go with their auth user (invited_by cascades), but nothing ties an invite to
 * the person it was sent to except the address. Left behind, a pending invite would be
 * waiting for whoever owns the address next (a work address reissued to someone else), and
 * accepting it would show them the inviter's activity; an accepted or refused one would keep
 * the deleted person's address in the inviter's sent list. The email comes from auth.users
 * for the signed-in person, never from the client.
 */
export async function forgetInvitesTo(email: string, q: Db = db): Promise<number> {
  const gone = await q.delete(friendInvites).where(eq(friendInvites.email, email.toLowerCase())).returning({ id: friendInvites.id });
  return gone.length;
}

/**
 * Unfriend: delete the pair row. A friend graph with no exit is a trap.
 */
export async function unfriend(viewerId: string, otherId: string, q: Db = db): Promise<void> {
  const [lo, hi] = orderedPair(viewerId, otherId);
  await q.delete(friendships).where(and(eq(friendships.userA, lo), eq(friendships.userB, hi)));
}
