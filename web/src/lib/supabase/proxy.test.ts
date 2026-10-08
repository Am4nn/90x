import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The proxy's maintenance decision: while the switch is on, only an approved admin gets the app. Supabase is
// faked (Auth) and so is the database lookup: who is signed in, their approval row, and whether either lookup fails.

const auth = vi.hoisted(() => ({
  user: null as { id: string } | null,
  approval: null as { status: string; isAdmin: boolean } | null,
  approvalThrows: false,
  getUser: vi.fn(),
  lookups: 0,
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      getUser: auth.getUser,
    },
  }),
}));
// The approval row comes from the server's database connection, not the Data API.
vi.mock("@/lib/auth/proxy-approval", () => ({
  approvalOf: async () => {
    auth.lookups++;
    if (auth.approvalThrows) throw new Error("db down");
    return auth.approval;
  },
}));

const { updateSession } = await import("./proxy");

const DOWN = () => NextResponse.json({ error: "maintenance" }, { status: 503 });
const SESSION = "sb-local-auth-token=x";
const call = (path: string, cookie: string | null = SESSION) =>
  updateSession(new NextRequest(`http://x${path}`, { headers: cookie ? { cookie } : {} }), { unlessAdmin: DOWN });

beforeEach(() => {
  auth.user = { id: "u1" };
  auth.approval = { status: "approved", isAdmin: true };
  auth.approvalThrows = false;
  auth.lookups = 0;
  auth.getUser.mockReset().mockImplementation(async () => ({ data: { user: auth.user } }));
});

describe("updateSession while maintenance is on", () => {
  it("lets an approved admin through", async () => {
    expect((await call("/today")).status).toBe(200);
  });

  it.each([
    ["a non-admin", { status: "approved", isAdmin: false }],
    ["a pending admin", { status: "pending", isAdmin: true }],
    ["a revoked admin", { status: "revoked", isAdmin: true }],
    ["someone with no approval row", null],
  ] as const)("blocks %s", async (_, approval) => {
    auth.approval = approval;
    expect((await call("/today")).status).toBe(503);
  });

  it("blocks a signed-out visitor without asking Auth when there is no session cookie", async () => {
    expect((await call("/today", null)).status).toBe(503);
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("blocks when Auth says the session is not valid", async () => {
    auth.user = null;
    expect((await call("/today")).status).toBe(503);
  });

  it("blocks when the approval lookup fails", async () => {
    auth.approvalThrows = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await call("/today")).status).toBe(503);
  });

  it("looks the approval up once, even on a path that also needs the /admin lock", async () => {
    // /admin paths are open under the switch, but a caller passing unlessAdmin there must not pay twice.
    expect((await call("/admin/settings")).status).toBe(200);
    expect(auth.lookups).toBe(1);
  });
});

describe("updateSession while maintenance is off", () => {
  it("never reads the database on an everyday path", async () => {
    expect((await updateSession(new NextRequest("http://x/today", { headers: { cookie: SESSION } }))).status).toBe(200);
    expect(auth.lookups).toBe(0);
  });

  it("reads the approval once on an /admin path", async () => {
    expect((await updateSession(new NextRequest("http://x/admin", { headers: { cookie: SESSION } }))).status).toBe(200);
    expect(auth.lookups).toBe(1);
  });
});

const admin = (path = "/admin/users", cookie: string | null = SESSION) =>
  updateSession(new NextRequest(`http://x${path}`, { headers: cookie ? { cookie } : {} }));
const notFound = (r: NextResponse) => {
  expect(r.status).toBe(404);
  expect(r.headers.get("x-middleware-rewrite")).toContain("/admin-denied");
};
const toLanding = (r: NextResponse) => {
  expect([302, 307]).toContain(r.status);
  expect(new URL(r.headers.get("location")!).pathname).toBe("/");
};

// The /admin lock, maintenance off: the proxy itself decides before any admin page or action code runs.
// A signed-out visitor is sent to the landing page to sign in; anyone else who is not an approved admin, and
// any failed lookup, gets the 404 page. Nothing but an approved admin row ever passes.
describe("updateSession on /admin (the proxy's own lock)", () => {
  it("lets an approved admin through", async () => {
    const r = await admin();
    expect(r.status).toBe(200);
    expect(r.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it.each([
    ["a non-admin", { status: "approved", isAdmin: false }],
    ["a pending admin", { status: "pending", isAdmin: true }],
    ["a revoked admin", { status: "revoked", isAdmin: true }],
    ["someone with no approval row", null],
  ] as const)("shows %s the 404 page", async (_, approval) => {
    auth.approval = approval;
    notFound(await admin());
  });

  it("sends a signed-out visitor to the landing page, without reading the database", async () => {
    auth.user = null;
    toLanding(await admin("/admin"));
    toLanding(await admin("/admin", null));
    expect(auth.lookups).toBe(0);
  });

  it("treats an Auth error as signed out: never a pass", async () => {
    auth.getUser.mockImplementation(async () => ({ data: { user: null }, error: new Error("auth down") }));
    toLanding(await admin());
    expect(auth.lookups).toBe(0);
  });

  it("never passes when Auth itself throws", async () => {
    auth.getUser.mockImplementation(async () => {
      throw new Error("network");
    });
    await expect(admin()).rejects.toThrow("network");
  });

  it("shows the 404 page when the approval lookup fails", async () => {
    auth.approvalThrows = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    notFound(await admin());
  });

  it("locks an encoded or double-encoded /admin path the same way", async () => {
    auth.approval = { status: "approved", isAdmin: false };
    notFound(await admin("/%61dmin/users"));
    notFound(await admin("/%2561dmin"));
  });

  it("does not lock a path that only starts with the letters", async () => {
    auth.approval = null;
    expect((await admin("/administrator")).status).toBe(200);
    expect(auth.lookups).toBe(0);
  });
});
