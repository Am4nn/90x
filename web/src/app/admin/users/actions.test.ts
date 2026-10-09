import { beforeEach, describe, expect, it, vi } from "vitest";

// The admin user actions with the connection, the deletion core and the mailer mocked. Reads answer
// from a queue in the order the action makes them.

const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ANA = "11111111-1111-4111-8111-111111111111";

const h = vi.hoisted(() => ({
  viewer: null as { id: string; isAdmin: boolean } | null,
  reads: [] as unknown[][],
  updates: [] as Record<string, unknown>[],
  sent: [] as { kind: string; subject: string; to: string }[],
  result: { ok: true } as { ok: true } | { error: string },
  letIn: [] as { userId: string }[],
}));
const removeAccount = vi.hoisted(() =>
  vi.fn<(args: { userId: string; by: string; actorId?: string }) => Promise<typeof h.result>>(async () => h.result),
);
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/viewer", () => ({ adminViewer: async () => h.viewer }));
vi.mock("@/lib/account/remove", () => ({ removeAccount }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/email", () => ({
  sendEmailBestEffort: async (input: { kind: string; email: { subject: string; to: string } }) => {
    h.sent.push({ kind: input.kind, subject: input.email.subject, to: input.email.to });
  },
}));
vi.mock("@/db", () => ({
  db: {
    execute: async () => h.reads.shift() ?? [],
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          h.updates.push(v);
          return Object.assign(Promise.resolve(), { returning: async () => h.letIn });
        },
      }),
    }),
    select: () => ({
      from: () => ({ where: async () => h.letIn.map((r) => ({ id: r.userId, email: `${r.userId.slice(0, 4)}@example.com` })) }),
    }),
  },
}));

const { approveAllWaiting, decide, deleteUser } = await import("./actions");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

/** The deleteUser target read: the account's email and whether it is an admin. */
const target = (email: string | null, isAdmin = false) => [{ email, is_admin: isAdmin }];

/** decide on Ana, who was `before` (null: no approval row), answering the email read after. */
const run = (before: string | null, status: string, isAdmin = false) => {
  h.reads = [before ? [{ status: before, is_admin: isAdmin }] : [], [{ email: "ana@example.com" }]];
  return decide({}, form({ userId: ANA, status }));
};

beforeEach(() => {
  h.viewer = { id: ADMIN, isAdmin: true };
  h.reads = [];
  h.updates = [];
  h.sent = [];
  h.result = { ok: true };
  h.letIn = [];
  removeAccount.mockClear();
  revalidatePath.mockClear();
});

describe("deleteUser", () => {
  it("deletes through the shared path as an admin when the typed email matches, ignoring case and spaces", async () => {
    h.reads = [target("ana@example.com")];
    const state = await deleteUser({}, form({ userId: ANA, confirm: "  Ana@Example.COM " }));
    expect(state).toEqual({ ok: true });
    expect(removeAccount).toHaveBeenCalledExactlyOnceWith({ userId: ANA, by: "admin", actorId: ADMIN });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("deletes nothing when the typed email does not match", async () => {
    h.reads = [target("ana@example.com")];
    const state = await deleteUser({}, form({ userId: ANA, confirm: "bob@example.com" }));
    expect(state).toEqual({ error: expect.stringMatching(/email/i) });
    expect(removeAccount).not.toHaveBeenCalled();
  });

  it("refuses a non-admin, yourself, a bad id, another admin and a missing account, deleting nothing", async () => {
    h.viewer = null;
    expect(await deleteUser({}, form({ userId: ANA, confirm: "ana@example.com" }))).toEqual({ error: "Only admins can do that." });
    h.viewer = { id: ADMIN, isAdmin: true };
    expect(await deleteUser({}, form({ userId: ADMIN, confirm: "me@example.com" }))).toEqual({ error: expect.any(String) });
    expect(await deleteUser({}, form({ userId: "not-a-uuid", confirm: "x@example.com" }))).toEqual({ error: expect.any(String) });
    h.reads = [target("boss@example.com", true)];
    expect(await deleteUser({}, form({ userId: ANA, confirm: "boss@example.com" }))).toEqual({ error: expect.any(String) });
    h.reads = [[]];
    expect(await deleteUser({}, form({ userId: ANA, confirm: "ana@example.com" }))).toEqual({ error: expect.any(String) });
    expect(removeAccount).not.toHaveBeenCalled();
  });

  it("refuses yourself written in capitals (Postgres compares uuids without case)", async () => {
    h.reads = [target("me@example.com")];
    expect(await deleteUser({}, form({ userId: ADMIN.toUpperCase(), confirm: "me@example.com" }))).toEqual({
      error: "That change isn't allowed.",
    });
    expect(removeAccount).not.toHaveBeenCalled();
  });

  it("passes the id on in lower case", async () => {
    h.reads = [target("ana@example.com")];
    await deleteUser({}, form({ userId: ANA.toUpperCase(), confirm: "ana@example.com" }));
    expect(removeAccount).toHaveBeenCalledExactlyOnceWith({ userId: ANA, by: "admin", actorId: ADMIN });
  });

  it("says so when the deletion fails", async () => {
    h.reads = [target("ana@example.com")];
    h.result = { error: "Couldn't delete the account." };
    expect(await deleteUser({}, form({ userId: ANA, confirm: "ana@example.com" }))).toEqual({
      error: expect.stringMatching(/Couldn't delete/),
    });
  });
});

describe("decide", () => {
  it("letting a waiting account in sends the You're in email", async () => {
    expect(await run("pending", "approved")).toEqual({ ok: true });
    expect(h.updates[0]).toMatchObject({ status: "approved", decidedBy: ADMIN });
    expect(h.sent).toEqual([{ kind: "approval", subject: "You're in: your 90x account is ready", to: "ana@example.com" }]);
  });

  it("blocking sends no email, whether the account was waiting or active", async () => {
    await run("pending", "rejected");
    await run("approved", "rejected");
    expect(h.updates.map((u) => u.status)).toEqual(["rejected", "rejected"]);
    expect(h.sent).toEqual([]);
  });

  it("never blocks yourself, even with the id in capitals", async () => {
    h.reads = [[{ status: "approved", is_admin: true }]];
    expect(await decide({}, form({ userId: ADMIN.toUpperCase(), status: "rejected" }))).toEqual({ error: "That change isn't allowed." });
    expect(h.updates).toEqual([]);
  });

  it("never blocks, unblocks or re-queues another admin", async () => {
    for (const status of ["rejected", "approved", "pending"]) {
      expect(await run("approved", status, true)).toEqual({ error: "Admin accounts are changed by hand." });
    }
    expect(h.updates).toEqual([]);
  });

  it("blocks a normal user", async () => {
    expect(await run("approved", "rejected", false)).toEqual({ ok: true });
    expect(h.updates[0]).toMatchObject({ status: "rejected", decidedBy: ADMIN });
  });

  it("unblocking sends no email", async () => {
    await run("rejected", "approved");
    expect(h.updates[0]).toMatchObject({ status: "approved" });
    expect(h.sent).toEqual([]);
  });
});

describe("approveAllWaiting", () => {
  it("says who was let in, and emails each of them", async () => {
    h.letIn = [{ userId: ANA }, { userId: ADMIN }];
    expect(await approveAllWaiting()).toEqual({ ok: true, note: "Let 2 people in." });
    expect(h.sent.map((m) => m.kind)).toEqual(["approval", "approval"]);
    h.letIn = [{ userId: ANA }];
    expect(await approveAllWaiting()).toEqual({ ok: true, note: "Let 1 person in." });
  });

  it("says so when nobody was waiting", async () => {
    expect(await approveAllWaiting()).toEqual({ ok: true, note: "Nobody was waiting." });
    expect(h.sent).toEqual([]);
  });
});
