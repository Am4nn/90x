import { eq, or, type SQL, sql } from "drizzle-orm";
import { cards, checkins, problems } from "@/db/schema";

// A problem the catalog dropped while someone's history held it stays in the database with
// `hidden` set (migration 039). Like a hidden card, it is never offered
// again, and the history that holds it keeps working: these filters go on queries that
// *offer* problems (Library, search, Today's and Coach's picks, new Feed cards) and never
// on ones that read a person's own check-ins, review ladder or problem page.

/** In the catalog: what the Library, search and every recommendation may show. */
export const listedProblem: SQL = eq(problems.hidden, false);

/**
 * Listed, or hidden but already attempted by this user. For the totals a person's progress
 * is measured against (pattern mastery, readiness coverage): a dropped problem nobody can
 * reach any more stops counting against them, and one they solved keeps counting for them.
 */
export const countedFor = (userId: string): SQL =>
  or(
    listedProblem,
    sql`exists (select 1 from ${checkins} where ${checkins.userId} = ${userId} and ${checkins.problemSlug} = ${problems.slug})`,
  )!;

/** A card is not about a hidden problem, on a query that left-joins `problems` on the card's problem. */
export const cardProblemListedJoined: SQL = sql`${problems.hidden} is not true`;

/** A card is not about a hidden problem, on a query that does not join `problems`. */
export const cardProblemListed: SQL = sql`not exists (select 1 from ${problems} where ${problems.slug} = ${cards.problemSlug} and ${problems.hidden})`;
