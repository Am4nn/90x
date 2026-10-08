// The Content-Security-Policy sent on every response (next.config.ts), and the one image
// host it allows besides this origin. Kept in one file so the Markdown renderer and the
// header cannot disagree about where an image may come from.

/** Hosts a problem statement's images may load from: LeetCode's own diagrams. */
export const STATEMENT_IMAGE_HOSTS = ["assets.leetcode.com"];

// Deliberately the directives that cost nothing and never touch scripts. There is no
// script-src because the App Router emits inline bootstrap scripts, so a real policy needs a
// per-request nonce, and a nonce forces every page to render per request (the landing page
// and /try are static).
//   - frame-ancestors 'none': the whole app is one-click actions behind a session cookie;
//   - object-src 'none': no plugin content (<object>, <embed>), which the app never uses;
//   - base-uri 'self': an injected <base> cannot point relative script URLs at another host;
//   - form-action 'self': a form can only post here. Every form and server action posts to this
//     origin and redirects only within it; Google sign-in is a script navigation
//     (signInWithOAuth), not a form post, so it is not affected;
//   - img-src: images come only from this origin (icons, splash screens, the link card, the
//     share card) and from LeetCode's statement diagrams. An image URL is a request the
//     browser makes by itself, so this stops rendered Markdown from sending page data to
//     another host even if the renderer let an image through. No avatar is rendered, and no
//     page uses a data: or blob: image.
// connect-src is left out on purpose: the browser talks to Supabase Auth, whose host differs
// per environment, and to the Sentry ingest host; a missed host would break sign-in or error
// reporting silently, while img-src already closes the channel Markdown could open.
export const CONTENT_SECURITY_POLICY = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  `img-src 'self' ${STATEMENT_IMAGE_HOSTS.map((h) => `https://${h}`).join(" ")}`,
].join("; ");
