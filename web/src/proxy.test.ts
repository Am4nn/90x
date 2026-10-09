import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/proxy", () => ({ updateSession }));
const flag = vi.hoisted(() => ({ maintenanceState: vi.fn(), maintenanceRefresh: vi.fn() }));
vi.mock("@/lib/maintenance/flag", () => flag);

import { proxy } from "./proxy";

const call = (path: string) => proxy(new NextRequest(`http://x${path}`));

describe("proxy on the share card", () => {
  it("answers 404 to undecodable percent-encoding instead of letting the router 500", async () => {
    for (const path of ["/api/share/%00%ff%25", "/api/share/%ff", "/api/share/abc%ff%25"]) {
      expect((await call(path)).status, path).toBe(404);
    }
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("passes the card through without touching the session, so no Set-Cookie can land on it", async () => {
    const res = await call("/api/share/k7m2p9qa?v=1-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBeNull();
    expect(updateSession).not.toHaveBeenCalled();
  });
});

describe("proxy on the public demo audio", () => {
  it("passes it through without touching the session, so the CDN-cached answer carries no Set-Cookie", async () => {
    const res = await call("/api/audio/demo");
    expect(res.headers.get("Set-Cookie")).toBeNull();
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("still refreshes the session on the signed-in audio routes", async () => {
    flag.maintenanceState.mockResolvedValueOnce({ on: false });
    await call("/api/audio/progress");
    expect(updateSession).toHaveBeenCalled();
  });
});

describe("proxy on the /try event beacon", () => {
  beforeEach(() => updateSession.mockClear());

  it("passes it through without touching the session: an anonymous beacon carries no cookie and gets none", async () => {
    const res = await call("/api/try/event");
    expect(res.headers.get("Set-Cookie")).toBeNull();
    expect(updateSession).not.toHaveBeenCalled();
  });
});

const request = (path: string, headers: Record<string, string> = {}) => new NextRequest(`http://x${path}`, { headers });

/** The answer the proxy hands updateSession for a non-admin, or null when it passes the request through. */
async function blockedAnswer(path: string, headers?: Record<string, string>) {
  await proxy(request(path, headers));
  const options = updateSession.mock.calls.at(-1)?.[1] as { unlessAdmin?: () => NextResponse } | undefined;
  return options?.unlessAdmin ? options.unlessAdmin() : null;
}

describe("proxy in maintenance mode", () => {
  const passed = NextResponse.next();

  beforeEach(() => {
    updateSession.mockReset().mockResolvedValue(passed);
    flag.maintenanceState.mockReset().mockResolvedValue({ on: false, message: "" });
    flag.maintenanceRefresh.mockReset().mockReturnValue(null);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("while live, passes every request through with no admin check", async () => {
    for (const path of ["/", "/today", "/api/coach/chat"]) expect(await blockedAnswer(path), path).toBeNull();
  });

  it("while on, rewrites a page to the maintenance page with 503, Retry-After and no-store", async () => {
    flag.maintenanceState.mockResolvedValue({ on: true, message: "" });
    for (const path of ["/", "/try", "/today"]) {
      const res = (await blockedAnswer(path))!;
      expect(res.status, path).toBe(503);
      expect(res.headers.get("x-middleware-rewrite"), path).toBe("http://x/maintenance");
      expect(res.headers.get("Retry-After")).toBe("300");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("x-90x-maintenance")).toBe("1");
    }
  });

  it("while on, answers an API route and a server action with 503 JSON", async () => {
    flag.maintenanceState.mockResolvedValue({ on: true, message: "" });
    for (const [path, headers] of [
      ["/api/coach/chat", {}],
      ["/privacy", { "next-action": "abc" }],
    ] as const) {
      const res = (await blockedAnswer(path, headers))!;
      expect(res.status, path).toBe(503);
      expect(await res.json()).toEqual({ error: "maintenance" });
    }
  });

  it("while on, does not even read the flag for an open path", async () => {
    flag.maintenanceState.mockResolvedValue({ on: true, message: "" });
    for (const path of ["/maintenance", "/admin/settings", "/auth/callback", "/privacy", "/api/jobs/hourly"]) {
      expect(await blockedAnswer(path), path).toBeNull();
    }
    expect(flag.maintenanceState).not.toHaveBeenCalled();
  });

  it("hands a background refresh of the flag to waitUntil, so the response never waits for it", async () => {
    const refresh = Promise.resolve();
    flag.maintenanceRefresh.mockReturnValue(refresh);
    const waitUntil = vi.fn();
    await proxy(request("/today"), { waitUntil } as never);
    expect(waitUntil).toHaveBeenCalledWith(refresh);
  });

  it("the break-glass blocks everyone, admins and /admin included, without the session, the database or Redis", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "1");
    for (const path of ["/", "/today", "/admin/settings", "/auth/callback", "/privacy"]) {
      const res = await proxy(request(path));
      expect(res.status, path).toBe(503);
      expect(res.headers.get("x-middleware-rewrite"), path).toBe("http://x/maintenance");
    }
    expect((await proxy(request("/api/share/k7m2p9qa"))).status).toBe(503);
    const api = await proxy(request("/api/jobs/hourly"));
    expect(api.status).toBe(503);
    expect(await api.json()).toEqual({ error: "maintenance" });
    expect(updateSession).not.toHaveBeenCalled();
    expect(flag.maintenanceState).not.toHaveBeenCalled();
  });

  it("the break-glass still serves the maintenance page itself", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "1");
    // Passed straight through: not even the session refresh runs under the break-glass.
    const res = await proxy(request("/maintenance"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(updateSession).not.toHaveBeenCalled();
  });
});
