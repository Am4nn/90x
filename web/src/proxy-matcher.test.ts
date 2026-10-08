import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/proxy", () => ({ updateSession: vi.fn() }));
vi.mock("@/lib/maintenance/flag", () => ({ maintenanceState: vi.fn(), maintenanceRefresh: vi.fn() }));

const { config } = await import("./proxy");

// Which requests run the proxy at all. A path it skips also skips any server action posted to it, and with
// that the maintenance switch, the break-glass and the /admin lock, so the static exclusions must name real
// static files only.
const runs = (url: string, headers: Record<string, string> = {}) => unstable_doesMiddlewareMatch({ config, url, headers });
const ACTION = { "next-action": "0123456789abcdef" };

describe("proxy matcher", () => {
  it.each([
    "/",
    "/today",
    "/try",
    "/admin",
    "/admin/settings",
    "/api/coach/chat",
    "/api/jobs/hourly",
    "/api/share/AbCd2345",
    "/auth/callback",
    "/maintenance",
    "/privacy",
    "/library/problem/two-sum",
  ])("runs on %s", (url) => {
    expect(runs(url)).toBe(true);
  });

  // The skips are anchored: a path that only starts like a static file is a real route and runs the proxy.
  it.each([
    "/api/healthx",
    "/api/health/x",
    "/favicon.icox",
    "/sw.json",
    "/sw.js/x",
    "/manifest.webmanifest/x",
    "/icons",
    "/opengraph-image/x",
  ])("runs on %s, which only looks like a skipped path", (url) => {
    expect(runs(url)).toBe(true);
  });

  it("runs on a dynamic route whose last segment looks like an image, with or without an action", () => {
    for (const url of ["/library/problem/x.png", "/admin/cards/x.png", "/coach/mocks/x.svg", "/api/share/x.png", "/me/weekly/a.ico"]) {
      expect(runs(url), url).toBe(true);
      expect(runs(url, ACTION), `${url} with an action`).toBe(true);
    }
  });

  it.each([
    "/favicon.ico",
    "/icon.svg",
    "/apple-icon.png",
    "/sw.js",
    "/manifest.webmanifest",
    "/opengraph-image",
    "/twitter-image",
    "/icons/icon-192.png",
    "/splash/splash-390x844@3x.png",
    "/_next/static/chunks/main.js",
    "/_next/image?url=%2Fx.png&w=64&q=75",
    "/api/health",
  ])("skips the static file or uptime check %s, so it pays nothing", (url) => {
    expect(runs(url)).toBe(false);
  });

  it("runs on any request carrying a server action, even at a static path", () => {
    for (const url of ["/favicon.ico", "/icons/icon-192.png", "/sw.js", "/_next/static/x.js", "/api/health"]) {
      expect(runs(url, ACTION), url).toBe(true);
    }
  });
});
