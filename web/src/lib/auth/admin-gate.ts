// The proxy's check on /admin. Pure, so the path matching and the decision are tested on
// their own. It runs before any admin page or action code, so a page that forgets its own
// guard still never renders to a non-admin. It is a second lock, not the only one: server
// actions can be called from any URL by their id, so each admin action still checks the
// viewer itself (see admin-guard.test.ts).

/** Whether a request path is under /admin once the server would have decoded and tidied it. */
export function isAdminPath(pathname: string): boolean {
  let path = pathname;
  try {
    // %61dmin routes to /admin, so look at the decoded path, twice for a double-encoded one.
    path = decodeURIComponent(decodeURIComponent(pathname));
  } catch {
    // A malformed escape never routes to a page; judge the raw path.
  }
  path = path.replace(/[/\x5c]{2,}/g, "/").replace(/\x5c/g, "/");
  return path === "/admin" || path.startsWith("/admin/");
}

export type AdminDecision = "pass" | "sign-in" | "not-found";

/** Signed out goes to sign-in; anyone signed in who is not an approved admin gets the 404 page. */
export function adminDecision(who: { signedIn: boolean; status: string | null; isAdmin: boolean }): AdminDecision {
  if (!who.signedIn) return "sign-in";
  return who.status === "approved" && who.isAdmin ? "pass" : "not-found";
}
