/** A site where problems are solved (LeetCode today). The app works without
 *  any source; this is an optional, pluggable integration. */
export type Submission = {
  id: string;
  slug: string;
  title: string;
  timestamp: number; // unix seconds
  status: string; // "Accepted", "Wrong Answer", ...
  lang: string;
};

export type Totals = {
  accepted: Record<string, number>; // by difficulty
  failed: Record<string, number>;
  untouched: Record<string, number>;
};

/** The username doesn't exist on the source: the user must fix it, and retrying won't help. */
export class UnknownUserError extends Error {}

/** LeetCode's wording for a missing user ("That user does not exist.", "User matching query does not exist."). */
export const isUnknownUserMessage = (message: string) => /user (matching query )?does not exist|user not found/i.test(message);

export interface ProblemActivitySource {
  readonly provider: "leetcode";
  recentSubmissions(username: string): Promise<Submission[]>;
  totals(username: string): Promise<Totals>;
}
