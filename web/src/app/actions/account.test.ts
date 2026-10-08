import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const viewer = { id: "u1", email: "Someone@Example.test", isAdmin: false };
const forgetInvitesTo = vi.fn<(email: string) => Promise<number>>(async () => {
  calls.push("forget");
  return 1;
});
const deleteUser = vi.fn<(id: string) => Promise<{ error: null }>>(async () => {
  calls.push("delete");
  return { error: null };
});

vi.mock("@/lib/auth/viewer", () => ({ getViewer: async () => viewer }));
vi.mock("@/lib/friends/service", () => ({ forgetInvitesTo }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({ auth: { admin: { deleteUser } } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signOut: async () => ({ error: null }) } }) }));
vi.mock("@/lib/upstash/redis", () => ({ redis: () => ({ del: async () => 0 }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { deleteAccount } = await import("./account");

const confirmed = () => {
  const form = new FormData();
  form.set("confirm", "DELETE");
  return form;
};

describe("deleteAccount", () => {
  beforeEach(() => {
    calls.length = 0;
    forgetInvitesTo.mockClear();
    deleteUser.mockClear();
  });

  it("removes the invites addressed to the person's email before the account itself", async () => {
    await deleteAccount({}, confirmed());
    expect(forgetInvitesTo).toHaveBeenCalledWith("Someone@Example.test");
    expect(calls).toEqual(["forget", "delete"]);
  });

  it("deletes nothing when the invites cannot be removed, so it can be retried", async () => {
    forgetInvitesTo.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const state = await deleteAccount({}, confirmed());
    expect(deleteUser).not.toHaveBeenCalled();
    expect(state).toEqual({ error: expect.stringMatching(/Couldn't delete/) });
  });
});
