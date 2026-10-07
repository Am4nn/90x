// Which requests the proxy must check against Supabase Auth, and which only need the session
// cookie kept fresh. The proxy runs before every request, prefetches included, so a network
// call here delays every tap. Access to app pages is decided in the page render (getViewer
// verifies the user there), so the proxy only needs a verified user where it decides itself:
// the /admin lock, and `/` and `/try`, which send a signed-in visitor on to Today.
import { isAdminPath } from "./admin-gate";

/** True when the proxy has to verify the user with Supabase Auth for this path. */
export function needsVerifiedUser(pathname: string): boolean {
  return pathname === "/" || pathname === "/try" || isAdminPath(pathname);
}
