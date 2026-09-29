// Pure helpers for the friendship pair key. No `server-only` import so the
// unit tests can load them.

/** The two ids in a canonical pair (user_a < user_b), so one friendships row
 * stands for the pair regardless of which user was passed first. */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Viewer first, then each friend in the order their row came back. */
export function collectFriendIds(viewerId: string, pairs: { userA: string; userB: string }[]): string[] {
  const ids = new Set<string>([viewerId]);
  for (const p of pairs) {
    ids.add(p.userA);
    ids.add(p.userB);
  }
  return [...ids];
}
