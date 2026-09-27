import "server-only";
import { mergeSubmissions, type Recent, type RecentAc } from "./merge";
import { isUnknownUserMessage, type ProblemActivitySource, type Totals, UnknownUserError } from "./source";

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
  const error = body.errors?.[0]?.message;
  if (error && isUnknownUserMessage(error)) throw new UnknownUserError(error);
  if (error || !body.data) throw new Error(error ?? "LeetCode returned no data");
  return body.data;
}

type Row = { count: number; difficulty: string };

export const leetcode: ProblemActivitySource = {
  provider: "leetcode",

  async recentSubmissions(username) {
    // For an unknown user the submission lists just come back empty; matchedUser
    // is what errors ("That user does not exist."), so a typo isn't read as "no activity".
    const data = await query<{ recentSubmissionList: Recent[] | null; recentAcSubmissionList: RecentAc[] | null }>(
      `query($u: String!, $l: Int!) {
         matchedUser(username: $u) { username }
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
    if (!p) throw new UnknownUserError("LeetCode user not found");
    const toMap = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.difficulty.toLowerCase(), r.count]));
    return {
      accepted: toMap(p.numAcceptedQuestions),
      failed: toMap(p.numFailedQuestions),
      untouched: toMap(p.numUntouchedQuestions),
    } satisfies Totals;
  },
};
