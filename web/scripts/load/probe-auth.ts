// What the per-request session check costs against the LOCAL Supabase API: needs the local env
// (NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY). Every signed-in page does a getUser (Auth) and a
// user_approvals read (PostgREST) before any page query.
import { signIn } from "./lib";

await signIn("probeauth");
const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!base || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set");
const r = await fetch(base + "/auth/v1/token?grant_type=password", {
  method: "POST",
  headers: { apikey: key, "content-type": "application/json" },
  body: JSON.stringify({ email: "probeauth@e2e.test", password: "e2e-local-only-password" }),
});
const tok = ((await r.json()) as { access_token: string }).access_token;
async function t(name: string, f: () => Promise<Response>) {
  const ms: number[] = [];
  for (let i = 0; i < 30; i++) {
    const s = performance.now();
    await (await f()).text();
    ms.push(performance.now() - s);
  }
  ms.sort((a, b) => a - b);
  console.log(name, "p50", (ms[15] ?? 0).toFixed(1), "ms");
}
const h = { apikey: key, authorization: "Bearer " + tok };
await t("auth getUser", () => fetch(base + "/auth/v1/user", { headers: h }));
await t("postgrest user_approvals", () => fetch(base + "/rest/v1/user_approvals?select=status,is_admin&limit=1", { headers: h }));
