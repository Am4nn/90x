import { createServerClient } from "@supabase/ssr";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  claimsOf,
  ecKeyPair,
  publicJwk,
  sessionCookies,
  signEs256,
  signHs256,
  unsigned,
  userClaims,
  withPayload,
} from "@/test-support/jwt-forge";
import { gate } from "./gate";
import { userIdFromClaims, verifiedUserId } from "./session-claims";
import { viewerFromRow, type ViewerRow } from "./viewer-row";

// The session check against forged sessions, end to end through the real @supabase/ssr cookie
// parsing and supabase-js getClaims, with only the network faked: a project whose JWKS holds one
// ES256 key, and an Auth server that, like the real one, accepts only tokens it signed.

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const KID = "project-kid";
const SECRET = "the-project's-own-jwt-secret"; // what the real Auth server holds; never published
const ANON_KEY = "sb_publishable_anon-key-everyone-can-see";

let project: CryptoKeyPair;
let attacker: CryptoKeyPair;
let jwks: { keys: object[] };

beforeAll(async () => {
  project = await ecKeyPair();
  attacker = await ecKeyPair();
  jwks = { keys: [await publicJwk(project.publicKey, KID)] };
});

type Net = { calls: string[] };

/** The claims of an HS256 token whose HMAC matches the project's secret, else null. */
async function signedBySecret(token: string) {
  try {
    const [header, payload, sig] = token.split(".");
    if (JSON.parse(Buffer.from(header!, "base64url").toString()).alg !== "HS256") return null;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, [
      "verify",
    ]);
    const ok = await crypto.subtle.verify("HMAC", key, Buffer.from(sig!, "base64url"), new TextEncoder().encode(`${header}.${payload}`));
    return ok ? claimsOf(token) : null;
  } catch {
    return null;
  }
}

/** A fake Supabase at `url`. `jwksDown` makes the JWKS endpoint fail. */
function fakeSupabase(url: string, opts: { jwksDown?: boolean } = {}) {
  const net: Net = { calls: [] };
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    net.calls.push(href);
    const path = new URL(href).pathname + new URL(href).search;
    if (!href.startsWith(url)) return new Response("not our project", { status: 599 });
    if (path === "/auth/v1/.well-known/jwks.json") {
      if (opts.jwksDown) throw new TypeError("fetch failed");
      return Response.json(jwks);
    }
    if (path === "/auth/v1/user") {
      // The real Auth server: only a token signed with the project's secret (or key) passes.
      const auth = new Headers(init?.headers).get("authorization") ?? "";
      const token = auth.replace(/^Bearer /, "");
      const claims = await signedBySecret(token);
      const genuine = claims && typeof claims.exp === "number" && claims.exp > Date.now() / 1000;
      if (!genuine) return Response.json({ code: 403, error_code: "bad_jwt", msg: "invalid JWT" }, { status: 403 });
      return Response.json({ id: claims.sub, aud: "authenticated", role: "authenticated", email: claims.email });
    }
    if (path.startsWith("/auth/v1/token")) {
      return Response.json({ code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" }, { status: 400 });
    }
    return new Response("unexpected", { status: 500 });
  };
  return { net, fetch };
}

/** The user id the app would see for a request carrying these cookies. */
async function viewerIdFor(cookies: { name: string; value: string }[], supa = fakeSupabase(PROJECT_URL), url = PROJECT_URL) {
  const client = createServerClient(url, ANON_KEY, {
    cookies: { getAll: () => cookies, setAll: () => {} },
    global: { fetch: supa.fetch },
  });
  return { id: await verifiedUserId(client.auth), net: supa.net };
}

const PROJECT_URL = "http://project.test";
const forProject = (token: string, opts?: Parameters<typeof sessionCookies>[2]) => sessionCookies(PROJECT_URL, token, opts);

describe("a genuine session", () => {
  it("is accepted from the ES256 signature, and the next request makes no network call at all", async () => {
    const token = await signEs256(project.privateKey, { kid: KID }, userClaims(USER));
    const supa = fakeSupabase(PROJECT_URL);
    expect((await viewerIdFor(forProject(token), supa)).id).toBe(USER);
    const before = supa.net.calls.length;
    expect((await viewerIdFor(forProject(token), supa)).id).toBe(USER);
    expect(supa.net.calls.slice(before)).toEqual([]);
    // Nothing but the project's own JWKS was ever fetched: never Auth's /user.
    expect(new Set(supa.net.calls)).toEqual(new Set([`${PROJECT_URL}/auth/v1/.well-known/jwks.json`]));
  });

  it("signed with the project's symmetric secret (a local HS256 stack) is accepted after Auth confirms it", async () => {
    const token = signHs256(SECRET, {}, userClaims(USER));
    const { id, net } = await viewerIdFor(forProject(token));
    expect(id).toBe(USER);
    expect(net.calls).toContain(`${PROJECT_URL}/auth/v1/user`);
  });

  it("is absent with no cookie", async () => {
    expect((await viewerIdFor([])).id).toBeNull();
  });
});

describe("a forged session is signed out", () => {
  it("(1) alg none, with or without the project's kid, in any spelling", async () => {
    for (const alg of ["none", "None", "NONE", "nOnE", ""]) {
      for (const header of [{ kid: KID }, {}]) {
        expect((await viewerIdFor(forProject(unsigned(header, userClaims(USER), alg)))).id).toBeNull();
      }
    }
  });

  it("(2) algorithm confusion: HS256 signed with the public key, the anon key or any public string", async () => {
    const jwk = jwks.keys[0] as { x: string; y: string };
    const publicStrings = [JSON.stringify(jwks.keys[0]), JSON.stringify(jwks), jwk.x, jwk.y, ANON_KEY, KID, "", "secret"];
    for (const secret of publicStrings) {
      for (const header of [{ kid: KID }, {}]) {
        const { id } = await viewerIdFor(forProject(signHs256(secret, header, userClaims(USER))));
        expect(id, `HS256 signed with ${secret.slice(0, 20)}`).toBeNull();
      }
    }
  });

  it("(2) algorithm confusion: an RS256 or ES384 header over the project's kid", async () => {
    for (const alg of ["RS256", "ES384", "PS256", "EdDSA"]) {
      const token = await signEs256(attacker.privateKey, { kid: KID, alg }, userClaims(USER));
      expect((await viewerIdFor(forProject(token))).id, alg).toBeNull();
    }
  });

  it("(3) signed by an attacker's own EC key, under the project's kid or a kid of its own", async () => {
    for (const kid of [KID, "attacker-kid", undefined]) {
      const token = await signEs256(attacker.privateKey, kid ? { kid } : {}, userClaims(USER));
      expect((await viewerIdFor(forProject(token))).id, String(kid)).toBeNull();
    }
  });

  it("(3) header-supplied keys and key URLs (jwk, jku, x5u) are never fetched or used", async () => {
    const evil = "http://evil.test/jwks.json";
    const header = { kid: "attacker-kid", jku: evil, x5u: evil, jwk: await publicJwk(attacker.publicKey, "attacker-kid") };
    const token = await signEs256(attacker.privateKey, header, userClaims(USER));
    const { id, net } = await viewerIdFor(forProject(token));
    expect(id).toBeNull();
    expect(net.calls.every((u) => u.startsWith(`${PROJECT_URL}/`))).toBe(true);
  });

  it("(4) expired, with a valid signature, whatever the session's own expiry field claims", async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const token = await signEs256(project.privateKey, { kid: KID }, userClaims(USER, { exp: past, iat: past - 3600 }));
    // The cookie says it is still good: getClaims checks the token's own exp, signed.
    expect((await viewerIdFor(forProject(token, { expiresAt: past + 7200 }))).id).toBeNull();
    // The cookie says it expired: the refresh is tried and refused, never the old token trusted.
    const { id, net } = await viewerIdFor(forProject(token, { expiresAt: past }));
    expect(id).toBeNull();
    expect(net.calls.some((u) => u.includes("/auth/v1/token"))).toBe(true);
  });

  it("(4) with no expiry at all", async () => {
    const claims = userClaims(USER);
    delete claims.exp;
    const token = await signEs256(project.privateKey, { kid: KID }, claims);
    expect((await viewerIdFor(forProject(token))).id).toBeNull();
  });

  it("(5) another project's token: its own key, kid and issuer", async () => {
    const token = await signEs256(
      attacker.privateKey,
      { kid: "other-project-kid" },
      userClaims(USER, { iss: "https://other-project.supabase.co/auth/v1" }),
    );
    expect((await viewerIdFor(forProject(token))).id).toBeNull();
  });

  it("(5) a genuinely signed token that is not a user session (anon or service role, another audience)", async () => {
    for (const extra of [
      { role: "anon" },
      { role: "service_role" },
      { aud: "other" },
      { aud: ["other"] },
      { sub: undefined },
      { sub: "admin" },
    ]) {
      const token = await signEs256(project.privateKey, { kid: KID }, userClaims(USER, extra));
      expect((await viewerIdFor(forProject(token))).id, JSON.stringify(extra)).toBeNull();
    }
  });

  it("(6) a payload edited after signing: another user's id, or a later expiry", async () => {
    const token = await signEs256(project.privateKey, { kid: KID }, userClaims(USER));
    const edits = [
      userClaims(OTHER),
      { ...claimsOf(token), exp: Number(claimsOf(token).exp) + 86_400 },
      { ...claimsOf(token), role: "service_role" },
    ];
    for (const claims of edits) {
      expect((await viewerIdFor(forProject(withPayload(token, claims)))).id).toBeNull();
    }
  });

  it("garbage in the cookie, or a token cut short", async () => {
    const token = await signEs256(project.privateKey, { kid: KID }, userClaims(USER));
    for (const bad of ["", "x", "a.b.c", `${token.split(".")[0]}.${token.split(".")[1]}`, `${token}.extra`, "eyJ.eyJ.sig"]) {
      expect((await viewerIdFor(forProject(bad))).id, bad).toBeNull();
    }
    expect((await viewerIdFor([{ name: "sb-project-auth-token", value: "base64-not-json" }])).id).toBeNull();
  });
});

describe("failures fail closed", () => {
  it("a JWKS that cannot be fetched signs a genuine session out instead of trusting it", async () => {
    // A different project URL, so the in-memory JWKS cache from the other tests is not used.
    const url = "http://jwks-down.test";
    const supa = fakeSupabase(url, { jwksDown: true });
    const token = await signEs256(project.privateKey, { kid: KID }, userClaims(USER));
    const { id, net } = await viewerIdFor(sessionCookies(url, token), supa, url);
    expect(id).toBeNull();
    expect(net.calls).toContain(`${url}/auth/v1/.well-known/jwks.json`);
  });

  it("a getClaims that throws is a signed-out viewer, not an error page", async () => {
    expect(await verifiedUserId({ getClaims: () => Promise.reject(new Error("boom")) })).toBeNull();
    expect(await verifiedUserId({ getClaims: async () => ({ data: null, error: new Error("bad") }) })).toBeNull();
    expect(await verifiedUserId({ getClaims: async () => ({ data: { claims: userClaims(USER) }, error: new Error("bad") }) })).toBeNull();
  });

  it("a failed verification is logged, without the token, and a missing session is not", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((line: string) => void lines.push(line));
    try {
      const url = "http://jwks-down-log.test";
      const token = await signEs256(project.privateKey, { kid: KID }, userClaims(USER));
      await viewerIdFor(sessionCookies(url, token), fakeSupabase(url, { jwksDown: true }), url);
      expect(lines.some((l) => l.includes("auth.verify_failed"))).toBe(true);
      expect(lines.join(" ")).not.toContain(token);
      lines.length = 0;
      await verifiedUserId({ getClaims: async () => ({ data: null, error: new AuthSessionMissingError() }) });
      expect(lines).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("userIdFromClaims", () => {
  it("takes only sub: nothing else in the token reaches the viewer", () => {
    const id = userIdFromClaims(userClaims(USER, { app_metadata: { role: "admin" }, is_admin: true, user_role: "admin" }));
    expect(id).toBe(USER);
  });

  it("refuses an expired, non-user or malformed set of claims", () => {
    const now = 1_000_000;
    expect(userIdFromClaims({ ...userClaims(USER), exp: now }, now)).toBeNull();
    expect(userIdFromClaims({ ...userClaims(USER), exp: now + 1 }, now)).toBe(USER);
    expect(userIdFromClaims({ ...userClaims(USER), exp: "9999999999" }, now)).toBeNull();
    expect(userIdFromClaims({ ...userClaims(USER), aud: ["authenticated", "x"] }, now)).toBe(USER);
    expect(userIdFromClaims(null)).toBeNull();
    expect(userIdFromClaims("claims")).toBeNull();
  });
});

const row = (over: Partial<ViewerRow> = {}): ViewerRow => ({
  email: "a@example.test",
  status: "approved",
  isAdmin: false,
  name: "A",
  avatarUrl: null,
  setupDoneAt: "2026-10-01T00:00:00Z",
  language: "python",
  hasLeetcodePremium: false,
  timezone: "UTC",
  ...over,
});
const where = (v: ReturnType<typeof viewerFromRow>) =>
  gate({ userId: v?.id ?? null, approval: v?.approval ?? null, setupDone: v?.setupDone ?? false });

describe("the database still decides access on every request", () => {
  it("(7) a valid session for a pending or rejected user goes to /pending, and is never an admin", () => {
    expect(where(viewerFromRow(USER, row({ status: "pending" })))).toBe("/pending");
    expect(where(viewerFromRow(USER, row({ status: "rejected", isAdmin: true })))).toBe("/pending");
    expect(viewerFromRow(USER, row({ status: "rejected", isAdmin: true }))?.isAdmin).toBe(false);
    expect(viewerFromRow(USER, row({ status: "pending", isAdmin: true }))?.isAdmin).toBe(false);
  });

  it("(8) a valid session for a deleted user (no row) is signed out", () => {
    expect(viewerFromRow(USER, undefined)).toBeNull();
    expect(where(viewerFromRow(USER, undefined))).toBe("/");
  });

  it("an approved, set-up user gets in, and admin comes from the row", () => {
    expect(where(viewerFromRow(USER, row()))).toBeNull();
    expect(viewerFromRow(USER, row())?.isAdmin).toBe(false);
    expect(viewerFromRow(USER, row({ isAdmin: true }))?.isAdmin).toBe(true);
  });

  it("keeps the old fallbacks: name from the email, UTC, no profile", () => {
    const v = viewerFromRow(
      USER,
      row({ name: null, avatarUrl: null, setupDoneAt: null, language: null, hasLeetcodePremium: null, timezone: null }),
    );
    expect(v).toEqual({
      id: USER,
      email: "a@example.test",
      name: "a@example.test",
      avatarUrl: null,
      approval: "approved",
      isAdmin: false,
      setupDone: false,
      language: null,
      hasPremium: false,
      timezone: "UTC",
    });
  });
});
