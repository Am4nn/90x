// Maintenance mode: which requests a down app still answers. Pure, so the path rules are tested on
// their own; the proxy (src/proxy.ts) asks these and the flag cache (flag.ts) says whether it is on.
//
// Two switches. The admin switch on /admin/settings lets admins keep using everything. The
// break-glass env var MAINTENANCE_MODE=1 is for a compromised admin account or database: it blocks
// everyone, admins included, and is read from the environment alone (no database, Redis or login).
import { isAdminPath } from "@/lib/auth/admin-gate";

export type MaintenanceState = { on: boolean; message: string };

export const LIVE: MaintenanceState = { on: false, message: "" };

/** The longest message an admin can put on the maintenance page. */
export const MAINTENANCE_MESSAGE_MAX = 140;

/** Where a blocked page request is rewritten to. */
export const MAINTENANCE_PATH = "/maintenance";

/** Set on every maintenance answer, so a client can tell it from any other 503. */
export const MAINTENANCE_HEADER = "x-90x-maintenance";

/** How long a client should wait before asking again, in seconds (the Retry-After header). */
export const RETRY_AFTER_SECONDS = 300;

/** The env break-glass: on for "1" or "true", whatever else is set or reachable. */
export function breakGlass(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.MAINTENANCE_MODE?.trim().toLowerCase();
  return value === "1" || value === "true";
}

/** The state stored in Redis. Anything malformed reads as live: a bad value must never take the app down. */
export function parseState(raw: unknown): MaintenanceState {
  if (!raw || typeof raw !== "object") return LIVE;
  const { on, message } = raw as { on?: unknown; message?: unknown };
  if (on !== true) return LIVE;
  return { on: true, message: typeof message === "string" ? message : "" };
}

/** The message as the page shows it: trimmed, or null when there is nothing to show. There is no default text. */
export function visibleMessage(message: string | null | undefined): string | null {
  const text = message?.trim();
  return text ? text : null;
}

/** One line, at most {@link MAINTENANCE_MESSAGE_MAX} characters once runs of whitespace are folded. */
export function tidyMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim();
}

// Paths a down app still serves to anyone: the page itself, admin (its own gate still applies), the
// sign-in round trip so an admin can sign in, scheduled jobs (the job wrapper skips them, answering 200 so
// QStash does not retry), the legal pages, the offline page and the files crawlers and link cards read.
const OPEN_EXACT = new Set([
  MAINTENANCE_PATH,
  "/api/test/sign-in",
  "/privacy",
  "/terms",
  "/delete-account",
  "/offline",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/opengraph-image",
  "/twitter-image",
  "/icon.svg",
  "/apple-icon.png",
  "/favicon.ico",
  "/sw.js",
  "/api/health",
]);
const OPEN_PREFIXES = ["/auth/", "/api/jobs/", "/icons/", "/_next/"];

/** What the proxy does with a request while maintenance is on. */
export type Gate = "open" | "page" | "api";

/** `isAction`: the request carries a `next-action` header. `method` defaults to GET. */
export type GateRequest = { pathname: string; isAction: boolean; method?: string };

/** A request that can change something: anything but GET and HEAD. */
const writes = (method = "GET") => method !== "GET" && method !== "HEAD";

/** Under the admin switch: open paths pass; a server action (postable to any URL) and /api answer 503 JSON; any other page gets the maintenance page.
 *  A write to a page path counts as a server action even without the header: Next also runs header-less form posts as actions. */
export function switchGate({ pathname, isAction, method }: GateRequest): Gate {
  if (isAction || (writes(method) && !isApi(pathname))) return isAdminPath(pathname) ? "open" : "api";
  // Open only if the path is open both as sent and as the server would decode and tidy it, so an
  // encoded path cannot look open here and route to a page that is not.
  if ([pathname, tidyPath(pathname)].every(isOpen)) return "open";
  return isApi(pathname) ? "api" : "page";
}

const isOpen = (path: string) => OPEN_EXACT.has(path) || OPEN_PREFIXES.some((p) => path.startsWith(p)) || isAdminPath(path);
const isApi = (path: string) => path === "/api" || path.startsWith("/api/");

/** The path decoded (twice, for a double-encoded one), with slashes and backslashes folded and dot segments resolved. */
function tidyPath(pathname: string): string {
  let path = pathname;
  try {
    path = decodeURIComponent(decodeURIComponent(pathname));
  } catch {
    // A malformed escape: judge the raw path.
  }
  path = path.replace(/[/\x5c]+/g, "/");
  try {
    return new URL(path, "http://x").pathname;
  } catch {
    return path;
  }
}

/** Under the break-glass: only reads of the maintenance page and the uptime check answer. Admin is blocked too, and every write is refused. */
export function breakGlassGate({ pathname, isAction, method }: GateRequest): Gate {
  const write = isAction || writes(method);
  if (!write && (pathname === MAINTENANCE_PATH || pathname === "/api/health")) return "open";
  return write || isApi(pathname) ? "api" : "page";
}
