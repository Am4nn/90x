// The proxy's approval lookup, over the server's own database connection (the Data API is closed to
// the browser roles, so the proxy cannot read user_approvals with the publishable key).
//
// The proxy imports this lazily, only when it actually decides (maintenance, /admin), so an everyday
// request never loads Drizzle or the schema. postgres.js does not connect until the first query either.
// No "server-only" import: the proxy bundle imports this, and it only ever runs on the server.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userApprovals } from "@/db/schema";

/** The verified user's approval row, or null when they have none. Throws when the database cannot be read. */
export async function approvalOf(userId: string): Promise<{ status: string; isAdmin: boolean } | null> {
  const [row] = await db
    .select({ status: userApprovals.status, isAdmin: userApprovals.isAdmin })
    .from(userApprovals)
    .where(eq(userApprovals.userId, userId));
  return row ?? null;
}
