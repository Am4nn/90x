import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The real table and the real predicates, with only the connection mocked: the WHERE each query
// would send is rendered by Drizzle's own dialect, so the test reads the SQL, not a mock's say-so.

const h = vi.hoisted(() => ({
  set: null as Record<string, unknown> | null,
  purgeWhere: null as unknown,
  strayWhere: null as unknown,
  order: [] as string[],
  listWhere: null as unknown,
  countWhere: null as unknown,
  purged: [] as { id: number }[],
  rows: [] as Record<string, unknown>[],
  total: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: {
    delete: () => ({
      where: (w: unknown) => ({
        returning: async () => {
          h.order.push("strays");
          h.strayWhere = w;
          return [];
        },
      }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: (w: unknown) => ({
          returning: async () => {
            h.order.push("empty");
            h.set = v;
            h.purgeWhere = w;
            return h.purged;
          },
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: (w: unknown) => ({
          orderBy: async () => {
            h.listWhere = w;
            return h.rows;
          },
        }),
      }),
    }),
    $count: async (...args: unknown[]) => {
      h.countWhere = args[1];
      return h.total;
    },
  },
}));

const { deletedAccounts, purgeDeletedAccounts, recordCutoff } = await import("./deleted");
const render = (w: unknown) => new PgDialect().sqlToQuery(w as SQL);
const NOW = new Date("2026-10-09T12:00:00Z");

beforeEach(() => {
  Object.assign(h, {
    set: null,
    purgeWhere: null,
    strayWhere: null,
    order: [],
    listWhere: null,
    countWhere: null,
    purged: [],
    rows: [],
    total: 0,
  });
});

describe("recordCutoff", () => {
  it("is 90 days before now", () => {
    expect(recordCutoff(NOW)).toBe("2026-07-11T12:00:00.000Z");
  });
});

describe("purgeDeletedAccounts", () => {
  it("leaves only a count of records older than 90 days: no person, no sign-up date, the month it happened", async () => {
    h.purged = [{ id: 1 }, { id: 2 }];
    expect(await purgeDeletedAccounts(NOW)).toBe(2);
    const { deletedAt, ...rest } = h.set!;
    expect(rest).toEqual({ userId: null, email: null, name: null, signedUpAt: null });
    expect(render(deletedAt).sql).toBe(`date_trunc('month', "deleted_accounts"."deleted_at")`);
    const { sql, params } = render(h.purgeWhere);
    expect(sql).toContain('"deleted_accounts"."deleted_at" <');
    expect(params).toContain("2026-07-11T12:00:00.000Z");
  });

  it("touches only records that still hold something, so the hourly run is idempotent", async () => {
    await purgeDeletedAccounts(NOW);
    const { sql } = render(h.purgeWhere);
    // Written as the partial index's own predicate (migration 050), so the planner can use it.
    expect(sql).toContain("(email is not null or name is not null or user_id is not null)");
  });

  it("first deletes an expired record whose account still exists, so a stray never becomes a count", async () => {
    await purgeDeletedAccounts(NOW);
    expect(h.order).toEqual(["strays", "empty"]);
    const { sql, params } = render(h.strayWhere);
    expect(sql).toContain('"deleted_accounts"."deleted_at" <');
    expect(sql).toContain("exists (select 1 from auth.users u where u.id = deleted_accounts.user_id)");
    expect(sql).not.toContain("not exists");
    expect(params).toContain("2026-07-11T12:00:00.000Z");
  });
});

describe("deletedAccounts", () => {
  it("lists the records still holding an email from the last 90 days, newest first, and counts every record", async () => {
    h.rows = [{ id: 3, email: "meera@x.test", name: "Meera S", signedUpAt: "2026-09-29", deletedAt: "2026-10-07", deletedBy: "self" }];
    h.total = 9;
    expect(await deletedAccounts(NOW)).toEqual({ recent: h.rows, total: 9 });
    const { sql, params } = render(h.listWhere);
    expect(sql).toContain('"deleted_accounts"."email" is not null');
    expect(sql).toContain('"deleted_accounts"."deleted_at" >=');
    expect(params).toContain("2026-07-11T12:00:00.000Z");
  });

  it("never shows or counts a record whose account still exists (a crash before the deletion, a failed undo)", async () => {
    await deletedAccounts(NOW);
    const live = "not exists (select 1 from auth.users u where u.id = deleted_accounts.user_id)";
    expect(render(h.listWhere).sql).toContain(live);
    expect(render(h.countWhere).sql).toContain(live);
  });
});
