import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { inboundEmails, lastSeenMailAt } from "./mail";
import { unreadOf } from "./mail-time";

// The two numbers on the Admin link.
//
// Split by what they ask of you, not by what they count. Red is somebody
// waiting on a decision only the admin can make: a person stuck on the pending
// screen, or mail sat in an inbox nobody opens. Blue is work that is queued and
// has no one blocked behind it - card batches sitting in draft, which hold the
// Feed but hold nobody's morning.
//
// One trip for both, because the layout renders on every app page and two
// round-trips per navigation for a badge is not a trade worth making.

export type AdminBadges = {
  /** Somebody is waiting on you. */
  attention: number;
  /** Queued work, nobody blocked. */
  review: number;
};

export async function adminBadges(userId: string): Promise<AdminBadges> {
  const [counts, emails, seenAt] = await Promise.all([
    db.execute<{ pending: number; drafts: number }>(sql`
      select
        (select count(*) from public.user_approvals where status = 'pending')::int as pending,
        (select count(*) from public.card_batches where status = 'draft')::int     as drafts`),
    inboundEmails(),
    lastSeenMailAt(userId),
  ]);
  const row = counts[0] ?? { pending: 0, drafts: 0 };
  // `null` from Resend means unreachable, not zero. Showing nothing is right:
  // an outage must not invent a badge, and it must not hide a real pending user.
  const unread = emails ? unreadOf(emails, seenAt) : 0;
  return { attention: row.pending + unread, review: row.drafts };
}
