import { ADMIN_PARAM_ROUTES, ADMIN_ROUTES, adminRoutesFromFs } from "./admin-surfaces";
import { check, section, skipped } from "./harness";
import type { World } from "./world";

// The other half: real requests to a running server.
//
// `direct.ts` proves the guards exist. It cannot prove a route reaches them. A
// page that forgot `requireViewer()` passes every direct round, because the
// direct rounds call the service helpers that have it. Only a request can say
// whether the route does. This sweep runs signed-out, so it is: does any route
// serve anything at all to a stranger off the street, and do the headers that
// are declared actually arrive.

interface Probe {
  status: number;
  location: string | null;
  body: string;
}

async function get(url: string, headers: Record<string, string> = {}): Promise<Probe> {
  const response = await fetch(url, { redirect: "manual", headers });
  return {
    status: response.status,
    location: response.headers.get("location"),
    body: await response.text().catch(() => ""),
  };
}

// Every route a signed-out stranger must not be served. The gate pages
// (/sign-in, /pending, /setup) are the destinations, not the subjects, and
// /offline is the public PWA fallback, so none of those appear here.
const APP_ROUTES = [
  "/today",
  "/feed",
  "/library",
  "/library/problem/brk-problem",
  "/library/topic/brk-topic",
  "/coach",
  "/coach/mocks",
  "/me",
  "/me/coach",
  "/me/plan",
  "/me/stories",
  "/me/weekly/00000000-0000-4000-8000-000000000000",
];

/**
 * The headers every response carries, asked of a real response rather than read
 * from the config, so a `headers()` that never matched the route looks exactly
 * like one that did and is caught. HSTS is not asserted: it is honoured over
 * HTTPS only, and this sweep runs against localhost.
 */
async function responseHeaders(base: string): Promise<void> {
  section("HTTP: the headers on every response");
  const response = await fetch(`${base}/sign-in`, { redirect: "manual" });
  const expected: [string, string][] = [
    ["content-security-policy", "frame-ancestors 'none'"],
    ["x-frame-options", "DENY"],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "strict-origin-when-cross-origin"],
    ["permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"],
  ];
  for (const [name, value] of expected) {
    const got = response.headers.get(name);
    check(`${name} is ${value}`, got === value, got ?? "absent");
  }
}

/** Real auth: a stranger off the street, with no cookie at all. */
async function sweepSignedOut(base: string): Promise<void> {
  section("HTTP: every route, signed out");

  // The positive control: the server is up and a gate page really renders. A
  // sweep against a server that 500s everything would otherwise pass every
  // "never served" check for the wrong reason.
  const gate = await get(`${base}/sign-in`);
  check("the sign-in gate itself is served", gate.status === 200, `${gate.status}`);

  // The second list, kept honest by the filesystem: a new admin page must be
  // added to ADMIN_ROUTES / ADMIN_PARAM_ROUTES, or this set comparison fails.
  const fromFs = adminRoutesFromFs();
  check(
    "the admin route list matches the filesystem",
    [...ADMIN_ROUTES].toSorted().join() === [...fromFs.statics].toSorted().join() && ADMIN_PARAM_ROUTES.length === fromFs.params.length,
    `listed ${ADMIN_ROUTES.length} static + ${ADMIN_PARAM_ROUTES.length} param; fs has ${fromFs.statics.length} static + ${fromFs.params.length} param`,
  );

  let served = 0;
  // App routes live under (app)/layout.tsx, whose requireViewer() redirects on
  // the server. A 200 here means the gate was bypassed.
  for (const path of APP_ROUTES) {
    const r = await get(base + path);
    const rendered = r.status === 200;
    if (rendered) served += 1;
    check(`${path} is not served signed out`, !rendered, `${r.status} ${r.location ?? ""}`);
  }
  // Admin routes render a client-side sign-in shell (200) rather than a server
  // redirect, so the test is that they never render admin data.
  for (const path of [...ADMIN_ROUTES, ...ADMIN_PARAM_ROUTES]) {
    const r = await get(base + path);
    const rendered = r.status === 200 && !r.body.includes("/sign-in");
    if (rendered) served += 1;
    check(`${path} is not served signed out`, !rendered, `${r.status} ${r.location ?? ""}`);
  }
  check("nothing was served to nobody", served === 0, `${served} route(s)`);
}

async function apiRoutes(base: string): Promise<void> {
  section("HTTP: the API routes");

  // Every scheduled job is a public URL that does something to everybody, and
  // the only guard is the QStash signature. The contract is "never 200 without
  // a valid signature": whether it answers 401 or 500 depends on the key being
  // configured, and both refuse.
  for (const job of ["/api/jobs/hourly", "/api/jobs/leetcode-sync"]) {
    const noSecret = await fetch(base + job, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    check(`${job} refuses a request with no signature`, noSecret.status !== 200, `${noSecret.status}`);
  }

  // The coach chat route requires a signed-in, approved, set-up user. A POST
  // with no session must be refused outright, before any model call.
  const chat = await fetch(base + "/api/coach/chat", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  check("the coach route refuses a request with no session", chat.status === 401, `${chat.status}`);

  // A route that does not exist must say so rather than fall through to one
  // that does.
  const nowhere = await get(`${base}/api/nope`);
  check("an unknown API route answers nothing", nowhere.status !== 200, `${nowhere.status}`);
}

export async function run(_w: World, base: string): Promise<void> {
  let up = false;
  try {
    const home = await get(base);
    up = home.status > 0;
  } catch {
    up = false;
  }
  if (!up) {
    section("HTTP");
    skipped("the whole HTTP sweep", `nothing answered at ${base}. Start the server first.`);
    return;
  }
  await responseHeaders(base);
  await sweepSignedOut(base);
  await apiRoutes(base);
}
