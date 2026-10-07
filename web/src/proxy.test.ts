import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const updateSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/proxy", () => ({ updateSession }));

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
