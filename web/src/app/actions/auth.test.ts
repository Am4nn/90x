import { beforeEach, describe, expect, it, vi } from "vitest";

const signOutMock = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signOut: signOutMock } }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { signOut } = await import("./auth");

describe("signOut", () => {
  beforeEach(() => signOutMock.mockClear());

  it("ends only this device's session, never every device's", async () => {
    await signOut();
    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
  });
});
