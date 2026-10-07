// The front door is `/`, a static page for people who are signed out, and `/try` is its public
// sample-card page. A signed-in visitor has no use for either, so the proxy sends them straight to
// Today. Doing it there, and not in the page, is what keeps both pages static: they never have to
// ask who is looking. (Someone who is signed in but not approved yet or not set up arrives at Today
// as well, and the app's own gate sends them on to /pending or /setup.)

const FRONT_DOOR_PATHS: readonly string[] = ["/", "/try"];

/** Where to send this request instead of serving it, or null to serve it. */
export function landingRedirect(pathname: string, signedIn: boolean): string | null {
  return signedIn && FRONT_DOOR_PATHS.includes(pathname) ? "/today" : null;
}
