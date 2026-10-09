// What someone types into "LeetCode username": a bare name, or the profile link
// copied from the address bar (leetcode.com/u/<name>/ or the older leetcode.com/<name>/).

const NAME = /^[A-Za-z0-9._-]{1,40}$/;
const PROFILE = /^(?:https?:\/\/)?(?:www\.)?leetcode\.(?:com|cn)\/(?:u\/)?([^/?#\s]+)\/?(?:[?#].*)?$/i;

/** The username in `raw`, or null when it can't be one. */
export function parseLeetcodeUsername(raw: string): string | null {
  const text = raw.trim().replace(/^@/, "");
  const name = PROFILE.exec(text)?.[1] ?? text;
  return NAME.test(name) ? name : null;
}
