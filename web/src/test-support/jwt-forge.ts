import { createHmac } from "node:crypto";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

// Building blocks for the forged-session tests: the session-claims unit tests and the
// break-in HTTP sweep. They craft tokens the way an attacker would (alg none, HS256 signed
// with public material, a stranger's EC key, a payload edited after signing) and wrap
// them in the cookie @supabase/ssr reads, so both suites attack the real parsing path.

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const part = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

export type JwtHeader = Record<string, unknown>;
export type JwtClaims = Record<string, unknown>;

/** A user session's claims as Supabase Auth issues them, valid for an hour. */
export function userClaims(sub: string, extra: JwtClaims = {}): JwtClaims {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub,
    aud: "authenticated",
    role: "authenticated",
    email: `${sub.slice(0, 8)}@example.test`,
    iat: now,
    exp: now + 3600,
    session_id: "00000000-0000-4000-8000-0000000000ff",
    is_anonymous: false,
    ...extra,
  };
}

export async function ecKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
}

/** The public half as a JWKS entry, the way Supabase publishes it. */
export async function publicJwk(key: CryptoKey, kid: string): Promise<JsonWebKey & { kid: string }> {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return { ...jwk, kid, alg: "ES256", use: "sig", key_ops: ["verify"] };
}

export async function signEs256(privateKey: CryptoKey, header: JwtHeader, claims: JwtClaims): Promise<string> {
  const input = `${part({ typ: "JWT", ...header, alg: header.alg ?? "ES256" })}.${part(claims)}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(input));
  return `${input}.${b64url(new Uint8Array(sig))}`;
}

export function signHs256(secret: string, header: JwtHeader, claims: JwtClaims): string {
  const input = `${part({ typ: "JWT", ...header, alg: "HS256" })}.${part(claims)}`;
  // node:crypto, not WebCrypto: an attacker may well try the empty string, which WebCrypto refuses as a key.
  return `${input}.${b64url(createHmac("sha256", secret).update(input).digest())}`;
}

/** `alg: none`: no signature at all. */
export function unsigned(header: JwtHeader, claims: JwtClaims, alg = "none"): string {
  return `${part({ typ: "JWT", ...header, alg })}.${part(claims)}.`;
}

/** The same token with its payload swapped and its original signature kept. */
export function withPayload(token: string, claims: JwtClaims): string {
  const [header, , sig] = token.split(".");
  return `${header}.${part(claims)}.${sig}`;
}

/** The claims inside a token, unverified. */
export function claimsOf(token: string): JwtClaims {
  return JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as JwtClaims;
}

/** The auth cookie name @supabase/ssr reads for a project URL. */
function authCookieName(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

/**
 * The session cookie(s) for an access token, as @supabase/ssr writes them. `expiresAt`
 * is the session's own expiry field (seconds), which an attacker also controls.
 */
export function sessionCookies(
  supabaseUrl: string,
  accessToken: string,
  opts: { refreshToken?: string; expiresAt?: number } = {},
): { name: string; value: string }[] {
  const claims = (() => {
    try {
      return claimsOf(accessToken);
    } catch {
      return {};
    }
  })();
  const session = {
    access_token: accessToken,
    refresh_token: opts.refreshToken ?? "forged-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: opts.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
    user: { id: claims.sub ?? "00000000-0000-4000-8000-000000000000", aud: "authenticated", role: "authenticated", email: claims.email },
  };
  return createChunks(authCookieName(supabaseUrl), `base64-${stringToBase64URL(JSON.stringify(session))}`);
}

/** The same cookies as a Cookie request header. */
export function cookieHeader(cookies: { name: string; value: string }[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}
