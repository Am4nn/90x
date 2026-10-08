import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const signOutMock = vi.fn<(opts: unknown) => Promise<{ error: null }>>(async () => {
  order.push("signOut");
  return { error: null };
});
const forgetDevice = vi.fn<(userId: string, endpoint: string) => Promise<void>>(async () => {
  order.push("forgetDevice");
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signOut: signOutMock } }) }));
const getViewer = vi.fn<() => Promise<{ id: string } | null>>(async () => ({ id: "u1" }));
vi.mock("@/lib/auth/viewer", () => ({ getViewer }));
vi.mock("@/lib/push", () => ({ forgetDevice }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { signOut } = await import("./auth");

const withEndpoint = (endpoint: string) => {
  const form = new FormData();
  form.set("endpoint", endpoint);
  return form;
};

describe("signOut", () => {
  beforeEach(() => {
    order.length = 0;
    signOutMock.mockClear();
    forgetDevice.mockClear();
  });

  it("ends only this device's session, never every device's", async () => {
    await signOut();
    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
    expect(forgetDevice).not.toHaveBeenCalled();
  });

  it("removes this device's push subscription, for the signed-in person only, before the session ends", async () => {
    await signOut(withEndpoint("https://push.example/abc"));
    expect(forgetDevice).toHaveBeenCalledWith("u1", "https://push.example/abc");
    expect(order).toEqual(["forgetDevice", "signOut"]);
  });

  it("still signs out when the viewer cannot be looked up", async () => {
    getViewer.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await signOut(withEndpoint("https://push.example/abc"));
    expect(forgetDevice).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
  });

  it("still signs out when the device cannot be removed", async () => {
    forgetDevice.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await signOut(withEndpoint("https://push.example/abc"));
    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
  });
});
