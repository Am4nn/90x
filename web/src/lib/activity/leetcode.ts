import "server-only";
import { mergeSubmissions, type Recent, type RecentAc } from "./merge";
import type { ProblemActivitySource, Totals } from "./source";

// LeetCode's public GraphQL (unofficial; can change without notice). Called
// directly from our server, no third-party proxy.
const ENDPOINT = "https://leetcode.com/graphql";

async function query<T>(q: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", referer: "https://leetcode.com", "user-agent": "Mozilla/5.0 90x" },
    body: JSON.stringify({ query: q, variables }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`LeetCode responded ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length || !body.data) throw new Error(body.errors?.[0]?.message ?? "LeetCode returned no data");
  return body.data;
}

type Row = { count: number; difficulty: string };

export const leetcode: ProblemActivitySource = {
  provider: "leetcode",

  async recentSubmissions(username) {
    const data = await query<{ recentSubmissionList: Recent[] | null; recentAcSubmissionList: RecentAc[] | null }>(
      `query($u: String!, $l: Int!) {
         recentSubmissionList(username: $u, limit: $l) { title titleSlug timestamp statusDisplay lang }
         recentAcSubmissionList(username: $u, limit: $l) { id title titleSlug timestamp lang }
       }`,
      { u: username, l: 20 },
    );
    return mergeSubmissions(data.recentSubmissionList ?? [], data.recentAcSubmissionList ?? []);
  },

  async totals(username) {
    const data = await query<{
      userProfileUserQuestionProgressV2: { numAcceptedQuestions: Row[]; numFailedQuestions: Row[]; numUntouchedQuestions: Row[] } | null;
    }>(
      `query($u: String!) { userProfileUserQuestionProgressV2(userSlug: $u) {
         numAcceptedQuestions { count difficulty } numFailedQuestions { count difficulty } numUntouchedQuestions { count difficulty } } }`,
      { u: username },
    );
    const p = data.userProfileUserQuestionProgressV2;
    if (!p) throw new Error("LeetCode user not found");
    const toMap = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.difficulty.toLowerCase(), r.count]));
    return { accepted: toMap(p.numAcceptedQuestions), failed: toMap(p.numFailedQuestions), untouched: toMap(p.numUntouchedQuestions) } satisfies Totals;
  },
};
