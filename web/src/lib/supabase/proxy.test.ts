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
