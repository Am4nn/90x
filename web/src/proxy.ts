import { type NextRequest, NextResponse } from "next/server";
import { captureSource, encodeAttribution, SOURCE_COOKIE, SOURCE_COOKIE_DAYS } from "@/lib/analytics/source";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // The share card is public and edge-cached: it never touches the session, so no Set-Cookie can land on it.
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/share/")) {
    // Next's router answers 500 for a dynamic segment that is not valid percent-encoding
    // (like %ff) before any handler runs, so a bad path is turned away here as a plain 404.
    if (!isDecodable(pathname)) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
    return NextResponse.next();
  }
  const response = await updateSession(request);
  rememberSource(request, response);
  return response;
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
    // Everything except static files, images, the service worker and the uptime check.
    "/((?!api/health|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
