import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  sets: [] as Record<string, unknown>[],
  jar: { values: {} as Record<string, string>, deleted: [] as string[] },
}));

vi.mock("@/db", () => {
  const select = { from: () => ({ where: async () => [] }) };
  return {
    db: {
      select: () => select,
      update: () => ({
        set: (v: Record<string, unknown>) => {
          h.sets.push(v);
          return { where: async () => undefined };
        },
      }),
    },
  };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name in h.jar.values ? { value: h.jar.values[name] } : undefined),
    delete: (name: string) => h.jar.deleted.push(name),
  }),
}));
vi.mock("@/lib/settings", () => ({ getSettings: async () => ({ autoApprove: false }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { exchangeCodeForSession: async () => ({ data: { user: { id: "u1", user_metadata: {} } }, error: null }) },
  }),
}));

import { GET } from "./route";

const call = () => GET(new Request("http://localhost/auth/callback?code=abc"));
const sourceSet = () => h.sets.find((s) => "signupSource" in s);

beforeEach(() => {
  h.sets.length = 0;
  h.jar.values = {};
  h.jar.deleted = [];
});

describe("the sign-in callback records which button was pressed", () => {
  it("stores the spot next to the source on a new profile and drops the cookie", async () => {
    h.jar.values = { x90_spot: "try", x90_src: "" };
    await call();
    expect(sourceSet()).toMatchObject({ signupSpot: "try", signupSource: "direct" });
    expect(h.jar.deleted).toContain("x90_spot");
  });

  it("stores null for a cookie that is not a known button", async () => {
    h.jar.values = { x90_spot: "TRY" };
    await call();
    expect(sourceSet()).toMatchObject({ signupSpot: null });
    expect(h.jar.deleted).toContain("x90_spot");
  });

  it("stores null when no button was pressed here", async () => {
    await call();
    expect(sourceSet()).toMatchObject({ signupSpot: null });
  });
});
