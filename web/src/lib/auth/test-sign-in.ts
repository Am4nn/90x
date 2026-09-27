// The e2e sign-in route ships in every build, so it refuses unless all three hold:
// - E2E=1: only the CI e2e job sets it.
// - VERCEL is unset: Vercel sets it on every preview and production deploy, so a
//   stray E2E variable in the Vercel dashboard still can't open the route.
// - Supabase is the local CLI stack: NEXT_PUBLIC_SUPABASE_URL is inlined at build
//   time, so a build pointed at the real project can never mint sessions for it.
// NODE_ENV is not part of the gate: CI runs `next start`, which is production.

const LOCAL_SUPABASE = new Set(["http://127.0.0.1:54321", "http://localhost:54321"]);

export function testSignInAllowed(env: { E2E?: string; VERCEL?: string; NEXT_PUBLIC_SUPABASE_URL?: string }): boolean {
  return env.E2E === "1" && env.VERCEL === undefined && LOCAL_SUPABASE.has(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
}
