// Who is signed in, from the session cookie, without asking Supabase Auth on every request.
//
// `auth.getClaims()` (supabase-js 2.117) reads the access token from the session cookie and:
// - rejects it when `exp` is in the past, before anything else;
// - for an asymmetric token (ES256/RS256 with a `kid`) verifies the signature locally with
//   WebCrypto against the project's JWKS, fetched only from `<NEXT_PUBLIC_SUPABASE_URL>/auth/v1/
//   .well-known/jwks.json` and cached in memory for 10 minutes. Header fields that name a key
//   (`jku`, `x5u`, `jwk`) are never read. A `kid` that is not in the cached set refetches the set
//   once; a `kid` that is not in the fresh set either falls through to the next point;
// - for anything else (HS256, `alg: none`, no `kid`, unknown `kid`) asks Supabase Auth instead
//   (`getUser(token)`), which verifies with the project's own secret and refuses a forged token.
// Any failure there (bad signature, unknown algorithm, JWKS or Auth unreachable, malformed token)
// is an error or a throw, and `verifiedUserId` turns every one of them into "signed out".
//
// From the verified claims only `sub` is used, to name the user. Everything that decides access
// (approval, admin, set up) and everything shown (email, name) is read from the database on the
// same request, never from the token. The claim checks below are defence in depth: a token our
// project signed for anything but a signed-in user (the anon or service role) is refused too.

import { isAuthSessionMissingError } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The user id in a set of verified claims, or null unless they describe a live, signed-in user session. */
export function userIdFromClaims(claims: unknown, nowSeconds = Math.floor(Date.now() / 1000)): string | null {
  if (!claims || typeof claims !== "object") return null;
  const c = claims as Record<string, unknown>;
  if (typeof c.sub !== "string" || !UUID.test(c.sub)) return null;
  if (typeof c.exp !== "number" || c.exp <= nowSeconds) return null;
  if (c.role !== "authenticated") return null;
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes("authenticated")) return null;
  return c.sub;
}

type ClaimsAuth = {
  getClaims: () => Promise<{ data: { claims: unknown } | null; error: unknown }>;
};

/** The verified user id behind this request's session cookie, or null for anything else. Never throws. */
export async function verifiedUserId(auth: ClaimsAuth): Promise<string | null> {
  try {
    const { data, error } = await auth.getClaims();
    if (error) {
      // No cookie at all is the everyday signed-out visitor, not a failure worth a log line.
      if (!isAuthSessionMissingError(error)) logVerifyFailure(error);
      return null;
    }
    if (!data) return null;
    return userIdFromClaims(data.claims);
  } catch (thrown) {
    // getClaims throws (rather than returning an error) on some malformed tokens and on an
    // algorithm WebCrypto cannot use. Every such case is a session we cannot trust: signed out.
    logVerifyFailure(thrown);
    return null;
  }
}

/** One line per failed verification, still signed out, so a JWKS or Auth outage that signs
 *  everyone out shows in the logs. The name, message and status only: never the token. */
function logVerifyFailure(error: unknown) {
  const e = error as { name?: unknown; message?: unknown; status?: unknown } | null;
  console.warn(
    JSON.stringify({
      event: "auth.verify_failed",
      name: typeof e?.name === "string" ? e.name : "unknown",
      message: typeof e?.message === "string" ? e.message.slice(0, 200) : "",
      status: typeof e?.status === "number" ? e.status : null,
    }),
  );
}
