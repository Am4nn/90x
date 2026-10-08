// Where a sign-in may send someone afterwards: a path on this site, never another host.
// One rule for the real callback and the test sign-in, so CI exercises what production runs.
//
// "//evil.com" and "/\evil.com" are both protocol-relative to a URL parser (it reads "\" as "/"),
// and it silently drops tabs and newlines, so "/\t/evil.com" becomes "//evil.com". So: a leading
// "/", not followed by "/" or "\", and no whitespace or control characters anywhere.
const SAFE_NEXT = /^\/(?![/\\])\S*$/;
const hasControl = (s: string) => [...s].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f);

export function isSafeNext(next: string | null | undefined): next is string {
  return typeof next === "string" && SAFE_NEXT.test(next) && !hasControl(next);
}

/** `next` when it is a path on this site, otherwise the fallback. */
export function safeNext(next: string | null | undefined, fallback = "/today"): string {
  return isSafeNext(next) ? next : fallback;
}
