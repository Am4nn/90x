import "server-only";
import { and, desc, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { deletedAccounts as deleted } from "@/db/schema";

// The deleted_accounts records (migration 050): a short record of each deletion for 90 days, then
// only the count. The privacy policy promises exactly this, so the numbers here are the promise.

const RECORD_DAYS = 90;

/** One deletion still within its 90 days, as the Deleted section of /admin/users shows it. */
export type DeletedAccount = {
  id: number;
  email: string | null;
  /** The name from their profile, or null if they never set one. */
  name: string | null;
  /** auth.users.created_at; null only for a record the purge has already emptied. */
  signedUpAt: string | null;
  deletedAt: string;
  deletedBy: "self" | "admin";
};

/** The moment a record's personal fields expire: 90 days before `now`, as an ISO string. */
export function recordCutoff(now: Date): string {
  return new Date(now.getTime() - RECORD_DAYS * 86_400_000).toISOString();
}

// A record whose account still exists is not a deletion: the app crashed between writing it and
// deleting the user, or a failed deletion could not take it back. Never shown, never counted.
// The column is written out rather than as deleted.userId: this matches a dead account's id, it does not
// scope to an owner, and check:user-scope must see the read as the cross-user query it is.
const live = sql`exists (select 1 from auth.users u where u.id = deleted_accounts.user_id)`;
const notLive = sql`not ${live}`;

// Still holds something personal. Written as the partial index's own predicate (migration 050), so
// the planner can use that index for the purge.
const holdsPersonal = sql`(email is not null or name is not null or user_id is not null)`;

/**
 * For /admin/users. `recent`: the records from the last 90 days that still hold an email, newest
 * first. `total`: every deletion since launch, emptied records included (the all-time count).
 * Neither includes a record whose account still exists in auth.users.
 */
export async function deletedAccounts(now = new Date()): Promise<{ recent: DeletedAccount[]; total: number }> {
  const cutoff = recordCutoff(now);
  const [recent, total] = await Promise.all([
    db
      .select({
        id: deleted.id,
        email: deleted.email,
        name: deleted.name,
        signedUpAt: deleted.signedUpAt,
        deletedAt: deleted.deletedAt,
        deletedBy: deleted.deletedBy,
      })
      .from(deleted)
      .where(and(isNotNull(deleted.email), gte(deleted.deletedAt, cutoff), notLive))
      .orderBy(desc(deleted.deletedAt)),
    db.$count(deleted, notLive),
  ]);
  return { recent: recent as DeletedAccount[], total };
}

/**
 * After 90 days only a count remains. First, an expired record whose account still exists is
 * deleted: it was never a deletion (a crash before the auth delete, an undo that failed), and
 * emptying it would turn it into a count of nothing. Then every other expired record is emptied:
 * user_id, email, name and signed_up_at become null and deleted_at keeps only its month; the row
 * and deleted_by stay, so the all-time count keeps it. Only rows that still hold something are
 * touched, so the hourly run is idempotent and usually changes nothing. Returns how many records
 * were emptied.
 */
export async function purgeDeletedAccounts(now = new Date()): Promise<number> {
  const cutoff = recordCutoff(now);
  const strays = await db
    .delete(deleted)
    .where(and(lt(deleted.deletedAt, cutoff), live))
    .returning({ id: deleted.id });
  if (strays.length) console.log(JSON.stringify({ evt: "deleted_accounts.strays_removed", count: strays.length }));
  const emptied = await db
    .update(deleted)
    .set({ userId: null, email: null, name: null, signedUpAt: null, deletedAt: sql`date_trunc('month', ${deleted.deletedAt})` })
    .where(and(lt(deleted.deletedAt, cutoff), holdsPersonal))
    .returning({ id: deleted.id });
  return emptied.length;
}
