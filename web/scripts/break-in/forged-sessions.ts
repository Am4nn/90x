import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServerClient } from "@supabase/ssr";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { adminClient } from "@/lib/supabase/admin";
import {
  claimsOf,
  cookieHeader,
  ecKeyPair,
  publicJwk,
  sessionCookies,
  signEs256,
  signHs256,
  unsigned,
  userClaims,
  withPayload,
} from "@/test-support/jwt-forge";
import { check, section, skipped } from "./harness";
import type { World } from "./world";

// Forged sessions against a real server. The app verifies the session cookie locally
// (getClaims: the token's signature against the project's JWKS, and its expiry) and reads
// approval from the database, so this round sends it every token an attacker could make,
// as the real cookie, to a protected page and to a server action, and asserts each is
// treated as signed out. Most impersonate the round's approved admin, the best prize.
//
// It needs a real session to start from, so it signs one user in with a password (the local
// and CI stacks allow it; a project with password sign-in off skips the round) and deletes
// that user at the end.

const PAGE = "/me";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/** Where the page sends this visitor: the path it redirects to, or null when it is served. */
type Answer = { status: number; to: string | null };

async function page(base: string, cookie: string): Promise<Answer> {
  const r = await fetch(base + PAGE, { redirect: "manual", headers: { cookie } });
  await r.arrayBuffer();
  const location = r.headers.get("location");
  return { status: r.status, to: location === null ? null : new URL(location, base).pathname };
}

/** Signed out: not served, and the app gate sends the visitor to the landing page. */
const signedOut = (a: Answer) => a.status !== 200 && a.to === "/";
const shown = (a: Answer) => `${a.status} ${a.to ?? ""}`;

/** A server action's id from the build in this checkout, if there is one. */
function actionId(name: string): string | null {
  const root = fileURLToPath(new URL("../../.next/static", import.meta.url));
  const walk = (dir: string): string | null => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        const found = walk(p);
        if (found) return found;
      } else if (e.name.endsWith(".js")) {
        for (const m of readFileSync(p, "utf8").matchAll(/createServerReference\)?\(\s*"([0-9a-f]{40,})"[^)]*?"(\w+)"\s*\)/g)) {
          if (m[2] === name) return m[1]!;
        }
      }
    }
    return null;
  };
  return walk(root);
}

async function difficultyOf(userId: string): Promise<string | null> {
  const [row] = await db.execute<{ d: string | null }>(
    sql`select feed_topics->>'difficulty' as d from public.profiles where user_id = ${userId}`,
  );
  return row?.d ?? null;
}

/** Calls saveDifficultyPreference("harder") as whoever the cookie says. */
async function setHarder(base: string, id: string, cookie: string): Promise<number> {
  const r = await fetch(`${base}/feed`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie, "next-action": id, accept: "text/x-component", "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(["harder"]),
  });
  await r.arrayBuffer();
  return r.status;
}

/** A real session for a fresh user, as the cookie the server would set. */
async function realSession(email: string, password: string) {
  const jar = new Map<string, string>();
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  return { token: data.session.access_token, cookie: [...jar].map(([n, v]) => `${n}=${v}`).join("; ") };
}

export async function run(w: World, base: string): Promise<void> {
  section("HTTP: forged sessions");
  const admin = adminClient();
  const email = `brk-${w.tag}-session@example.test`;
  const password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) {
    skipped("forged sessions", `could not create a user to sign in with: ${created.error?.message}`);
    return;
  }
  const me = created.data.user.id;
  try {
    await db.execute(sql`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${me}`);
    await db.execute(sql`update public.profiles set name = 'Break session', setup_done_at = now() where user_id = ${me}`);
    const real = await realSession(email, password);
    if (!real) {
      skipped("forged sessions", "password sign-in is off for this project");
      return;
    }
    await forgedRound(w, base, me, real);
  } finally {
    await admin.auth.admin.deleteUser(me).catch(() => undefined);
    const [left] = await db.execute<{ n: number }>(sql`select count(*)::int as n from auth.users where id = ${me}`);
    check("the session round's own user is gone", (left?.n ?? 0) === 0);
  }
}

async function forgedRound(w: World, base: string, me: string, real: { token: string; cookie: string }): Promise<void> {
  // Positive controls: the genuine session is let in, so every refusal below is the check's doing.
  const genuine = await page(base, real.cookie);
  check(`a genuine session is served ${PAGE}`, genuine.status === 200, shown(genuine));

  const jwks = (await (await fetch(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)).json()) as { keys: (JsonWebKey & { kid: string })[] };
  const projectKey = jwks.keys[0];
  const header = JSON.parse(Buffer.from(real.token.split(".")[0]!, "base64url").toString("utf8")) as Record<string, unknown>;
  const kid = (header.kid as string | undefined) ?? projectKey?.kid ?? "none";
  check("the project signs sessions with an asymmetric key", header.alg === "ES256" || header.alg === "RS256", String(header.alg));

  // Every forgery names the admin the round made: an approved admin is the best prize.
  const victim = userClaims(w.admin, { email: `brk-${w.tag}-admin@example.test` });
  const attacker = await ecKeyPair();
  const forged: [string, string][] = [
    ["alg none, the project's kid", unsigned({ kid }, victim)],
    ["alg none, no kid", unsigned({}, victim)],
    ["alg None", unsigned({ kid }, victim, "None")],
    ["HS256 signed with the published JWKS", signHs256(JSON.stringify(jwks), { kid }, victim)],
    ["HS256 signed with the public key", signHs256(JSON.stringify(projectKey), { kid }, victim)],
    ["HS256 signed with the key's x", signHs256(String(projectKey?.x), {}, victim)],
    ["HS256 signed with the publishable key", signHs256(PUBLISHABLE_KEY, {}, victim)],
    ["HS256 signed with the empty string", signHs256("", {}, victim)],
    ["an attacker's EC key under the project's kid", await signEs256(attacker.privateKey, { kid }, victim)],
    ["an attacker's EC key under its own kid", await signEs256(attacker.privateKey, { kid: "attacker" }, victim)],
    [
      "an attacker's key offered in the header (jwk, jku, x5u)",
      await signEs256(
        attacker.privateKey,
        {
          kid: "attacker",
          jwk: await publicJwk(attacker.publicKey, "attacker"),
          jku: "http://127.0.0.1:9/jwks.json",
          x5u: "http://127.0.0.1:9/x",
        },
        victim,
      ),
    ],
    ["a genuine token with the payload swapped for the admin's", withPayload(real.token, { ...claimsOf(real.token), sub: w.admin })],
    [
      "a genuine token with its expiry pushed out",
      withPayload(real.token, { ...claimsOf(real.token), exp: Number(claimsOf(real.token).exp) + 86_400 }),
    ],
    ["a genuine token cut short", real.token.split(".").slice(0, 2).join(".")],
  ];

  const action = actionId("saveDifficultyPreference");
  const before = await difficultyOf(w.admin);

  for (const [name, token] of forged) {
    const cookie = cookieHeader(sessionCookies(SUPABASE_URL, token));
    const a = await page(base, cookie);
    check(`${PAGE} treats a forged session as signed out: ${name}`, signedOut(a), shown(a));
    if (action) await setHarder(base, action, cookie);
  }
  // An expired session whose refresh token is forged: the refresh is refused, never the old token trusted.
  const expired = cookieHeader(sessionCookies(SUPABASE_URL, real.token, { expiresAt: Math.floor(Date.now() / 1000) - 60 }));
  const e = await page(base, expired);
  check(`${PAGE} treats an expired session with a forged refresh token as signed out`, signedOut(e), shown(e));

  if (action) {
    check(
      "no forged session changed the admin's settings through a server action",
      (await difficultyOf(w.admin)) === before,
      String(await difficultyOf(w.admin)),
    );
    // The control for the action itself: the genuine session does change its own settings.
    await setHarder(base, action, real.cookie);
    check("a genuine session's server action does take effect", (await difficultyOf(me)) === "harder", String(await difficultyOf(me)));
  } else {
    skipped("forged sessions through a server action", "no build in this checkout to read action ids from");
  }

  // (7) A genuine, unexpired session whose approval is withdrawn: refused on the next request.
  for (const status of ["pending", "rejected"]) {
    await db.execute(
      sql`update public.user_approvals set status = ${status}, decided_at = ${status === "pending" ? null : sql`now()`} where user_id = ${me}`,
    );
    const a = await page(base, real.cookie);
    check(`a genuine session for a ${status} user goes to /pending`, a.status !== 200 && a.to === "/pending", shown(a));
  }
  await db.execute(sql`update public.user_approvals set status = 'approved', decided_at = now() where user_id = ${me}`);

  // (8) A genuine, unexpired session whose account is deleted: signed out on the next request.
  await adminClient().auth.admin.deleteUser(me);
  const gone = await page(base, real.cookie);
  check("a genuine session for a deleted user is signed out", signedOut(gone), shown(gone));
}
