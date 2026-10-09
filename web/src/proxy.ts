import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import { captureSource, encodeAttribution, SOURCE_COOKIE, SOURCE_COOKIE_DAYS } from "@/lib/analytics/source";
import { maintenanceRefresh, maintenanceState } from "@/lib/maintenance/flag";
import {
  breakGlass,
  breakGlassGate,
  type Gate,
  MAINTENANCE_HEADER,
  MAINTENANCE_PATH,
  RETRY_AFTER_SECONDS,
  switchGate,
} from "@/lib/maintenance/rules";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest, event?: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  const gateRequest = { pathname, isAction: request.headers.has("next-action"), method: request.method };
  // The break-glass needs nothing but the environment: no database, Redis or login (not even a session refresh), and no exceptions.
  if (breakGlass()) {
    const gate = breakGlassGate(gateRequest);
    return gate === "open" ? NextResponse.next() : down(request, gate);
  }
  // The share card is public and edge-cached: it never touches the session, so no Set-Cookie can land on it.
  // It stays up under the admin switch: an image with no session, nothing to protect from a closed app.
  if (pathname.startsWith("/api/share/")) {
    // Next's router answers 500 for a dynamic segment that is not valid percent-encoding
    // (like %ff) before any handler runs, so a bad path is turned away here as a plain 404.
    if (!isDecodable(pathname)) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
    return NextResponse.next();
  }
  // The demo audio answer is public and CDN-cached too (app/api/audio/demo/route.ts): no session, no Set-Cookie.
  if (pathname === "/api/audio/demo") return NextResponse.next();
  // The /try event beacon is anonymous by design (app/api/try/event/route.ts): no session read, no cookie set.
  if (pathname === "/api/try/event") return NextResponse.next();
  const response = await updateSession(request, await maintenanceSwitch(request, switchGate(gateRequest), event));
  rememberSource(request, response);
  return response;
}

/** While the admin switch is on, what a blocked request gets instead (admins pass; updateSession checks). Free while it is off:
 *  the flag is read from this instance's memory, and a stale one is refreshed after the response, never before it. */
async function maintenanceSwitch(request: NextRequest, gate: Gate, event?: NextFetchEvent) {
  if (gate === "open") return {};
  const state = await maintenanceState();
  const refresh = maintenanceRefresh();
  if (refresh) event?.waitUntil(refresh);
  return state.on ? { unlessAdmin: () => down(request, gate) } : {};
}

/** The app is down: pages get the maintenance page, APIs and server actions a JSON answer, all 503 and never cached. */
function down(request: NextRequest, gate: Exclude<Gate, "open">): NextResponse {
  // x-90x-maintenance lets an open app tab tell this answer from any other error and reload (components/maintenance/reload-on-down.tsx).
  const headers = { "Retry-After": String(RETRY_AFTER_SECONDS), "Cache-Control": "no-store", [MAINTENANCE_HEADER]: "1" };
  if (gate === "api") return NextResponse.json({ error: "maintenance" }, { status: 503, headers });
  return NextResponse.rewrite(new URL(MAINTENANCE_PATH, request.url), { status: 503, headers });
}

function isDecodable(pathname: string): boolean {
  try {
    decodeURIComponent(pathname);
    return true;
  } catch {
    return false;
  }
}

/** First visit from a campaign or another site: keep where from, for the Analytics page, until sign-up.
 *  Only real page loads count (not API calls, the sign-in round trip or prefetches). */
function rememberSource(request: NextRequest, response: NextResponse) {
  const { pathname } = request.nextUrl;
  const dest = request.headers.get("sec-fetch-dest");
  if (request.method !== "GET" || pathname.startsWith("/api") || pathname.startsWith("/auth")) return;
  if ((dest && dest !== "document") || request.headers.get("next-router-prefetch")) return;
  const found = captureSource({
    url: request.nextUrl,
    referer: request.headers.get("referer"),
    host: request.nextUrl.hostname,
    hasCookie: request.cookies.has(SOURCE_COOKIE),
  });
  if (!found) return;
  response.cookies.set(SOURCE_COOKIE, encodeAttribution(found), {
    maxAge: SOURCE_COOKIE_DAYS * 24 * 60 * 60,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    httpOnly: true,
  });
}

export const config = {
  matcher: [
    // Everything except real static files: build output, the two public folders, root-level files (favicon, icons,
    // the service worker, the manifest, the link-card images) and the uptime check. Each is anchored to where the
    // file really is: a skipped path also skips Server Function calls posted to it, so "any path ending in .png"
    // would let a dynamic route such as /library/problem/x.png run its actions with no proxy (and no maintenance).
    "/((?!_next/static/|_next/image|icons/|splash/|api/health$|favicon\\.ico$|sw\\.js$|manifest\\.webmanifest$|opengraph-image$|twitter-image$|[^/]+\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
    // A server action always goes through the proxy, whatever the path.
    { source: "/:path*", has: [{ type: "header", key: "next-action" }] },
  ],
};
