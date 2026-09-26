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

export interface ProblemActivitySource {
  readonly provider: "leetcode";
  recentSubmissions(username: string): Promise<Submission[]>;
  totals(username: string): Promise<Totals>;
}
