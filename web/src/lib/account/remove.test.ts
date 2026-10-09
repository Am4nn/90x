import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// removeAccount with everything it reaches mocked, recording the order of the steps. The order is the
// point: the record before anything is deleted, the record taken back when the deletion fails, and
// either email (admin or self) only after the account is gone.

const h = vi.hoisted(() => ({
  calls: [] as string[],
  person: { email: "Ana@Example.test", name: "Ana M", created_at: "2026-09-29 10:00:00+00", is_admin: false } as Record<
    string,
    unknown
  > | null,
  inserted: [] as Record<string, unknown>[],
  upsert: null as { target: unknown; targetWhere: unknown; set: Record<string, unknown> } | null,
  inMaintenance: [] as (boolean | undefined)[],
  failInsert: false,
  failForget: false,
  failDelete: false,
  failRedis: false,
  failMail: false,
  /** After a failed auth deletion: whether the auth user is still there (null: the check itself fails). */
  stillThere: true as boolean | null,
  executes: 0,
  sent: [] as { kind: string; subject: string; to: string }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: {
    // The first read is the person; any later one is the "is the auth user still there?" check.
    execute: async () => {
      if (h.executes++ === 0) {
        h.calls.push("read");
        return h.person ? [h.person] : [];
      }
      h.calls.push("check");
      if (h.stillThere === null) throw new Error("db down");
      return h.stillThere ? [{ "?column?": 1 }] : [];
    },
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoUpdate: (c: { target: unknown; targetWhere: unknown; set: Record<string, unknown> }) => ({
          returning: async () => {
            if (h.failInsert) throw new Error("insert broke");
            h.calls.push("record");
            h.inserted.push(v);
            h.upsert = c;
            return [{ id: 7 }];
          },
        }),
      }),
    }),
    delete: () => ({
      where: async () => {
        h.calls.push("unrecord");
      },
    }),
  },
}));
vi.mock("@/db/schema", () => ({ deletedAccounts: { id: "id", userId: "user_id" } }));
vi.mock("@/lib/friends/service", () => ({
  forgetInvitesTo: async (email: string) => {
    if (h.failForget) throw new Error("db down");
    h.calls.push(`forget ${email}`);
    return 1;
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          h.calls.push(`delete ${id}`);
          return { error: h.failDelete ? new Error("auth down") : null };
        },
      },
    },
  }),
}));
vi.mock("@/lib/upstash/redis", () => ({
  redis: () => ({
    del: async () => {
      if (h.failRedis) throw new Error("redis blip");
      h.calls.push("redis");
      return 1;
    },
  }),
}));
vi.mock("@/lib/email", () => ({
  sendEmailBestEffort: async (input: { kind: string; email: { subject: string; to: string }; evenInMaintenance?: boolean }) => {
    h.inMaintenance.push(input.evenInMaintenance);
    if (h.failMail) throw new Error("resend down");
    h.calls.push(`mail ${input.kind}`);
    h.sent.push({ kind: input.kind, subject: input.email.subject, to: input.email.to });
  },
}));

const { removeAccount } = await import("./remove");
const U = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  Object.assign(h, {
    calls: [],
    inserted: [],
    upsert: null,
    inMaintenance: [],
    sent: [],
    failInsert: false,
    failForget: false,
    failDelete: false,
    failRedis: false,
    failMail: false,
    stillThere: true,
    executes: 0,
  });
  h.person = { email: "Ana@Example.test", name: "Ana M", created_at: "2026-09-29 10:00:00+00", is_admin: false };
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("removeAccount by the person themselves", () => {
  it("records, forgets invites, deletes, clears Redis, then sends the you-deleted email", async () => {
    expect(await removeAccount({ userId: U, by: "self" })).toEqual({ ok: true });
    expect(h.calls).toEqual(["read", "record", "forget Ana@Example.test", `delete ${U}`, "redis", "mail account-deleted"]);
    expect(h.inserted).toEqual([
      { userId: U, email: "Ana@Example.test", name: "Ana M", signedUpAt: "2026-09-29 10:00:00+00", deletedBy: "self" },
    ]);
    expect(h.sent).toEqual([{ kind: "account-deleted", subject: "Your 90x account is deleted", to: "Ana@Example.test" }]);
  });

  it("deletes nothing and keeps no record when the invites cannot be removed, so it can be retried", async () => {
    h.failForget = true;
    expect(await removeAccount({ userId: U, by: "self" })).toEqual({ error: expect.any(String) });
    expect(h.calls).toEqual(["read", "record", "unrecord"]);
    expect(h.sent).toEqual([]);
  });

  it("keeps no record and sends no email when the auth deletion fails", async () => {
    h.failDelete = true;
    expect(await removeAccount({ userId: U, by: "self" })).toEqual({ error: expect.any(String) });
    expect(h.calls).toEqual(["read", "record", "forget Ana@Example.test", `delete ${U}`, "check", "unrecord"]);
    expect(h.sent).toEqual([]);
  });

  it("keeps the record and finishes when the auth deletion errored but the user is gone anyway", async () => {
    h.failDelete = true;
    h.stillThere = false;
    expect(await removeAccount({ userId: U, by: "self" })).toEqual({ ok: true });
    expect(h.calls).toEqual(["read", "record", "forget Ana@Example.test", `delete ${U}`, "check", "redis", "mail account-deleted"]);
  });

  it("takes the record back when the auth deletion errored and the check cannot say", async () => {
    h.failDelete = true;
    h.stillThere = null;
    expect(await removeAccount({ userId: U, by: "self" })).toEqual({ error: expect.any(String) });
    expect(h.calls).toEqual(["read", "record", "forget Ana@Example.test", `delete ${U}`, "check", "unrecord"]);
    expect(h.sent).toEqual([]);
  });

  it("deletes nothing when the record cannot be written", async () => {
    h.failInsert = true;
    expect(await removeAccount({ userId: U, by: "self" })).toEqual({ error: expect.any(String) });
    expect(h.calls).toEqual(["read"]);
  });

  it("is not undone by a Redis blip or a mail failure", async () => {
    h.failRedis = true;
    h.failMail = true;
    expect(await removeAccount({ userId: U, by: "self" })).toEqual({ ok: true });
    expect(h.calls).toContain(`delete ${U}`);
    expect(h.calls).not.toContain("unrecord");
  });

  it("reuses the account's record on a retry: one record per account, never two", async () => {
    await removeAccount({ userId: U, by: "self" });
    expect(h.upsert?.target).toBe("user_id");
    expect(new PgDialect().sqlToQuery(h.upsert?.targetWhere as SQL).sql).toBe("user_id is not null");
    const { deletedAt, ...rest } = h.upsert!.set;
    expect(rest).toEqual({ email: "Ana@Example.test", name: "Ana M", signedUpAt: "2026-09-29 10:00:00+00", deletedBy: "self" });
    expect(new PgDialect().sqlToQuery(deletedAt as SQL).sql).toBe("now()");
  });

  it("sends the deletion email even during maintenance (the Terms promise it)", async () => {
    await removeAccount({ userId: U, by: "self" });
    h.executes = 0;
    await removeAccount({ userId: U, by: "admin", actorId: "admin-1" });
    expect(h.inMaintenance).toEqual([true, true]);
  });

  it("records a blank name as no name", async () => {
    h.person = { ...h.person, name: null };
    await removeAccount({ userId: U, by: "self" });
    expect(h.inserted[0]).toMatchObject({ name: null });
  });
});

describe("removeAccount by an admin", () => {
  it("emails the person only after the deletion succeeded", async () => {
    expect(await removeAccount({ userId: U, by: "admin", actorId: "admin-1" })).toEqual({ ok: true });
    expect(h.calls).toEqual(["read", "record", "forget Ana@Example.test", `delete ${U}`, "redis", "mail account-deleted-by-admin"]);
    expect(h.inserted[0]).toMatchObject({ deletedBy: "admin" });
    expect(h.sent).toEqual([{ kind: "account-deleted-by-admin", subject: "Your 90x account was deleted", to: "Ana@Example.test" }]);
  });

  it("sends nothing and keeps no record when the auth deletion fails", async () => {
    h.failDelete = true;
    expect(await removeAccount({ userId: U, by: "admin", actorId: "admin-1" })).toEqual({ error: expect.any(String) });
    expect(h.sent).toEqual([]);
    expect(h.calls).toContain("unrecord");
  });

  it("still deletes when the email cannot be sent", async () => {
    h.failMail = true;
    expect(await removeAccount({ userId: U, by: "admin", actorId: "admin-1" })).toEqual({ ok: true });
    expect(h.calls).toContain(`delete ${U}`);
    expect(h.calls).not.toContain("unrecord");
  });

  it("sends nothing when the invites cannot be removed", async () => {
    h.failForget = true;
    expect(await removeAccount({ userId: U, by: "admin", actorId: "admin-1" })).toEqual({ error: expect.any(String) });
    expect(h.sent).toEqual([]);
    expect(h.calls).not.toContain(`delete ${U}`);
  });
});

describe("removeAccount refuses", () => {
  it("an account that does not exist, touching nothing", async () => {
    h.person = null;
    expect(await removeAccount({ userId: U, by: "admin", actorId: "admin-1" })).toEqual({ error: expect.any(String) });
    expect(h.calls).toEqual(["read"]);
  });

  it("an admin account, touching nothing", async () => {
    h.person = { ...h.person, is_admin: true };
    expect(await removeAccount({ userId: U, by: "self" })).toEqual({ error: expect.any(String) });
    expect(h.calls).toEqual(["read"]);
  });

  it("an account with no email skips the invites and the email but is still deleted", async () => {
    h.person = { ...h.person, email: null };
    expect(await removeAccount({ userId: U, by: "self" })).toEqual({ ok: true });
    expect(h.calls).toEqual(["read", "record", `delete ${U}`, "redis"]);
  });
});
