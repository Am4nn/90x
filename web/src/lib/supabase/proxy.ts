import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { adminDecision, isAdminPath } from "@/lib/auth/admin-gate";
import type { Database } from "./database.types";

/** Refreshes the Supabase session cookie on every request. Access decisions
 *  (signed in, approved, set up) happen in the app layout, not here, except
 *  /admin, which is also locked here. */
export async function updateSession(request: NextRequest) {
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
  // Must run right after creating the client: it refreshes an expired token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Everything under /admin, pages and the action requests posted to them, is checked here
  // as well as in the page or action itself, so a new admin page cannot be left open.
  if (isAdminPath(request.nextUrl.pathname)) {
    const { data: approval } = user
      ? await supabase.from("user_approvals").select("status, is_admin").eq("user_id", user.id).maybeSingle()
      : { data: null };
    const decision = adminDecision({ signedIn: Boolean(user), status: approval?.status ?? null, isAdmin: Boolean(approval?.is_admin) });
    if (decision !== "pass") {
      const denied =
        decision === "sign-in"
          ? NextResponse.redirect(new URL("/sign-in", request.url))
          : // A path nothing routes to, so the app's own 404 page answers with a real 404.
            NextResponse.rewrite(new URL("/admin-denied", request.url), { status: 404 });
      // Keep any session cookie the refresh above just set.
      response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
      return denied;
    }
  }
  return response;
}
