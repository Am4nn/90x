import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { type AdminDecision, adminDecision, isAdminPath } from "@/lib/auth/admin-gate";
import { landingRedirect } from "@/lib/auth/landing-gate";
import { needsVerifiedUser } from "@/lib/auth/proxy-check";
import type { Database } from "./database.types";

/** Refreshes the Supabase session cookie on every request. Access decisions
 *  (signed in, approved, set up) happen in the app layout, not here, except
 *  /admin, which is also locked here, and `/` and `/try`, which a signed-in visitor skips.
 *  Only those three ask Supabase Auth who is signed in: everywhere else the cookie is
 *  just kept fresh, with no network call while the token is valid, so a tap or a
 *  prefetch never waits on Auth here (the page render verifies the user itself).
 *
 *  `unlessAdmin` is the maintenance switch: while it is on, a request it blocks is answered
 *  with `unlessAdmin()` unless the viewer is an approved admin. Only then does every path
 *  pay for the Auth check and the approval lookup (over the server's database connection: the
 *  publishable key reaches Supabase Auth only, never a table). */
export async function updateSession(request: NextRequest, { unlessAdmin }: { unlessAdmin?: () => NextResponse } = {}) {
  // No Supabase session cookie at all: nobody to check, so no round trip to Auth before the maintenance answer.
  if (unlessAdmin && !request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return unlessAdmin();
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // Must run right after creating the client: both refresh an expired token and save the new
  // cookie. getSession reads the cookie without asking Auth, so it is trusted for nothing here;
  // where the proxy itself decides, getUser verifies the token with Supabase.
  if (!unlessAdmin && !needsVerifiedUser(request.nextUrl.pathname)) {
    await supabase.auth.getSession();
    return response;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Asked at most once per request (maintenance and the /admin lock may both need it). A failed lookup is never "pass".
  let asked: Promise<AdminDecision> | undefined;
  const admin = () =>
    (asked ??= (async () => {
      try {
        // Over the server connection, loaded only here: an everyday request never pulls in the database client.
        const approval = user ? await (await import("@/lib/auth/proxy-approval")).approvalOf(user.id) : null;
        return adminDecision({ signedIn: Boolean(user), status: approval?.status ?? null, isAdmin: Boolean(approval?.isAdmin) });
      } catch (e) {
        console.error("admin lookup failed in the proxy", e);
        return user ? "not-found" : "sign-in";
      }
    })());

  // Maintenance: an admin uses the app as usual; anyone else gets the maintenance answer.
  if (unlessAdmin && (await admin()) !== "pass") return keepSession(response, unlessAdmin());

  // Everything under /admin, pages and the action requests posted to them, is checked here
  // as well as in the page or action itself, so a new admin page cannot be left open.
  if (isAdminPath(request.nextUrl.pathname)) {
    const decision = await admin();
    if (decision !== "pass") {
      return keepSession(
        response,
        decision === "sign-in"
          ? NextResponse.redirect(new URL("/", request.url))
          : // A path nothing routes to, so the app's own 404 page answers with a real 404.
            NextResponse.rewrite(new URL("/admin-denied", request.url), { status: 404 }),
      );
    }
  }

  // The landing page at `/` and the sample-card page at `/try` are static; signed-in visitors are sent on from here so it never has to ask who is looking.
  const home = landingRedirect(request.nextUrl.pathname, Boolean(user));
  if (home) return keepSession(response, NextResponse.redirect(new URL(home, request.url)));
  return response;
}

/** The answer to give instead of the page, carrying any session cookie the refresh above just set. */
function keepSession(from: NextResponse, instead: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => instead.cookies.set(cookie));
  return instead;
}
