import { beforeEach, describe, expect, it, vi } from "vitest";

// The steps of a deletion are removeAccount's (lib/account/remove.test.ts). This covers what the
// Settings action adds: who may delete, the typed word, the shared path called as "self", and the exit.

const h = vi.hoisted(() => ({
  viewer: { id: "u1", email: "Someone@Example.test", isAdmin: false } as { id: string; email: string; isAdmin: boolean } | null,
  result: { ok: true } as { ok: true } | { error: string },
  signedOut: false,
}));
const removeAccount = vi.hoisted(() => vi.fn<(args: { userId: string; by: string }) => Promise<typeof h.result>>(async () => h.result));
const redirect = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/viewer", () => ({ getViewer: async () => h.viewer }));
vi.mock("@/lib/account/remove", () => ({ removeAccount }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signOut: async () => {
        h.signedOut = true;
        return { error: null };
      },
    },
  }),
}));
vi.mock("next/navigation", () => ({ redirect }));

const { deleteAccount } = await import("./account");

const typed = (word: string) => {
  const form = new FormData();
  form.set("confirm", word);
  return form;
};

describe("deleteAccount", () => {
  beforeEach(() => {
    h.viewer = { id: "u1", email: "Someone@Example.test", isAdmin: false };
    h.result = { ok: true };
    h.signedOut = false;
    removeAccount.mockClear();
    redirect.mockClear();
  });

  it("deletes through the shared path as the person themselves, then signs out and leaves", async () => {
    await deleteAccount({}, typed("delete"));
    expect(removeAccount).toHaveBeenCalledExactlyOnceWith({ userId: "u1", by: "self" });
    expect(h.signedOut).toBe(true);
    expect(redirect).toHaveBeenCalledWith("/?deleted=1");
  });

  it("keeps the person signed in with the old message when the deletion fails", async () => {
    h.result = { error: "Couldn't delete the account." };
    const state = await deleteAccount({}, typed("DELETE"));
    expect(state).toEqual({ error: "Couldn't delete your account. Try again, or email us and we will do it by hand." });
    expect(h.signedOut).toBe(false);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("deletes nothing without the typed word", async () => {
    expect(await deleteAccount({}, typed("DEL"))).toEqual({ error: "Type DELETE to confirm." });
    expect(removeAccount).not.toHaveBeenCalled();
  });

  it("deletes nothing for an admin or a signed-out visitor", async () => {
    h.viewer = { id: "a1", email: "admin@example.test", isAdmin: true };
    expect(await deleteAccount({}, typed("DELETE"))).toEqual({ error: expect.stringMatching(/Admin accounts are removed by hand/) });
    h.viewer = null;
    expect(await deleteAccount({}, typed("DELETE"))).toEqual({ error: expect.stringMatching(/signed out/) });
    expect(removeAccount).not.toHaveBeenCalled();
  });
});
