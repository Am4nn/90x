import { readdirSync } from "node:fs";
import { join } from "node:path";

// The admin surface, listed here rather than discovered, ON PURPOSE.
//
// The admin actions themselves are session-based server actions (they derive
// the user from the cookie via requireViewer), so they cannot be called
// directly with a foreign id; their escalation is proven at the RLS layer by
// check-rls.ts ("only admins record batch verdicts", "admin can approve").
// What a stranger *can* touch is the routes, so the HTTP sweep (http.ts) probes
// each of these signed-out and asserts it never renders. A second list has to
// be updated by hand, and `adminRoutesFromFs` below fails loudly when it has
// not been.
export const ADMIN_ROUTES: string[] = [
  "/admin",
  "/admin/users",
  "/admin/cards",
  "/admin/cards/flagged",
  "/admin/cards/rated",
  "/admin/mail",
  "/admin/settings",
  "/admin/reports",
];

// One route with a path parameter each, so the sweep asks for a concrete row too.
export const ADMIN_PARAM_ROUTES: string[] = [
  "/admin/cards/00000000-0000-4000-8000-000000000000",
  "/admin/mail/00000000-0000-4000-8000-000000000000",
];

/** The admin routes, read from the filesystem so the hand list cannot drift. */
export function adminRoutesFromFs(): { statics: string[]; params: string[] } {
  const statics: string[] = [];
  const params: string[] = [];
  const walk = (dir: string, route: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${route}/${entry.name}`);
      else if (entry.name === "page.tsx") (route.includes("[") ? params : statics).push(`/admin${route}`);
    }
  };
  walk("src/app/admin", "");
  return { statics, params };
}
