import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  topic: null as { slug: string; name: string } | null,
  values: null as Record<string, unknown> | null,
  conflict: null as { target: unknown; set: Record<string, unknown> } | null,
  insertFails: false,
  claim: "OK" as string | null,
  redisFails: false,
  claimed: [] as { key: string; opts: unknown }[],
  released: [] as string[],
  lookups: [] as unknown[][],
  rows: [] as Record<string, unknown>[],
  deleteWhere: null as unknown,
  logged: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/log", () => ({ logError: (m: string) => void h.logged.push(m) }));
vi.mock("./tools-data", () => ({
  topicBySlugOrName: async (...args: unknown[]) => {
    h.lookups.push(args);
    return h.topic;
  },
}));
vi.mock("@/lib/upstash/redis", () => ({
  redis: () => ({
    set: async (k: string, _v: unknown, opts: unknown) => {
      if (h.redisFails) throw new Error("redis down");
      h.claimed.push({ key: k, opts });
      return h.claim;
    },
    del: async (k: string) => void h.released.push(k),
  }),
}));
vi.mock("@/db", () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoUpdate: async (c: { target: unknown; set: Record<string, unknown> }) => {
          if (h.insertFails) throw new Error("db down");
          h.values = v;
          h.conflict = c;
        },
      }),
    }),
    select: () => ({ from: () => ({ orderBy: () => ({ limit: async () => h.rows }) }) }),
    delete: () => ({
      where: async (w: unknown) => {
        h.deleteWhere = w;
      },
    }),
  },
}));

const { clearLibraryGap, libraryGaps, noteLibraryGap, normalizeGapTopic } = await import("./gaps");
const dialect = new PgDialect();
const sqlOf = (x: unknown) => dialect.sqlToQuery(x as never);

beforeEach(() => {
  Object.assign(h, {
    topic: null,
    values: null,
    conflict: null,
    insertFails: false,
    claim: "OK",
    redisFails: false,
    claimed: [],
    released: [],
    lookups: [],
    rows: [],
    deleteWhere: null,
    logged: [],
  });
});

describe("normalizeGapTopic", () => {
  it("trims, collapses whitespace and lowercases", () => {
    expect(normalizeGapTopic("  Convex   Hull \n")).toBe("convex hull");
  });
  it("keeps the allowed punctuation", () => {
    expect(normalizeGapTopic("C++ / C# & .NET's re-entrancy")).toBe("c++ / c# & .net's re-entrancy");
  });
  it("accepts letters beyond ASCII", () => {
    expect(normalizeGapTopic("Dijkstra Über")).toBe("dijkstra über");
  });
  it("rejects too short and too long", () => {
    expect(normalizeGapTopic("a")).toBeNull();
    expect(normalizeGapTopic("  x ")).toBeNull();
    expect(normalizeGapTopic("a".repeat(80))).toBe("a".repeat(80));
    expect(normalizeGapTopic("a".repeat(81))).toBeNull();
  });
  it("rejects characters outside the allowed set", () => {
    for (const bad of ["drop table; --", "<script>", "what is a trie?", "emoji 🙂", "a,b", "(x)", "a_b", "100%"]) {
      expect(normalizeGapTopic(bad)).toBeNull();
    }
  });
  it("measures length after normalizing", () => {
    expect(normalizeGapTopic("a" + " ".repeat(200) + "b")).toBe("a b");
  });
});

describe("noteLibraryGap", () => {
  it("upserts the normalized topic and adds one ask to an existing row", async () => {
    h.topic = { slug: "alg-convex-hull", name: "Convex hull" };
    expect(await noteLibraryGap("u1", "  Convex   Hull ")).toEqual({ noted: true });
    expect(h.values).toMatchObject({ topic: "convex hull", topicSlug: "alg-convex-hull" });
    const set = h.conflict!.set;
    expect(Object.keys(set).toSorted()).toEqual(["asks", "lastAskedAt", "topicSlug"]);
    expect(sqlOf(set.asks).sql).toContain("+ 1");
    expect(sqlOf(set.topicSlug).sql).toMatch(/^coalesce\(excluded\.topic_slug, /);
  });
  it("leaves topic_slug null when no taxonomy topic matches", async () => {
    await noteLibraryGap("u1", "convex hull");
    expect(h.values?.topicSlug).toBeNull();
  });
  it("refuses a topic that does not normalize, without touching Redis or the database", async () => {
    expect(await noteLibraryGap("u1", "what is this?!")).toEqual({ noted: false });
    expect(h.claimed).toEqual([]);
    expect(h.values).toBeNull();
  });
  it("claims one day per person and topic with set NX and a 1 day TTL", async () => {
    await noteLibraryGap("u1", "Convex Hull");
    const day = new Date().toISOString().slice(0, 10);
    expect(h.claimed).toEqual([{ key: `90x:coach:gap:u1:convex hull:${day}`, opts: { nx: true, ex: 86_400 } }]);
  });
  it("counts a repeat from the same person that day once: no second write", async () => {
    h.claim = null;
    expect(await noteLibraryGap("u1", "convex hull")).toEqual({ noted: true });
    expect(h.values).toBeNull();
  });
  it("still counts when Redis is down", async () => {
    h.redisFails = true;
    expect(await noteLibraryGap("u1", "convex hull")).toEqual({ noted: true });
    expect(h.values).toMatchObject({ topic: "convex hull" });
  });
  it("logs a database failure and reports it instead of throwing", async () => {
    h.insertFails = true;
    expect(await noteLibraryGap("u1", "convex hull")).toEqual({ noted: false });
    expect(h.logged).toHaveLength(1);
  });
  it("gives the day's claim back when the write fails, so asking again later that day still counts", async () => {
    h.insertFails = true;
    await noteLibraryGap("u1", "convex hull");
    const day = new Date().toISOString().slice(0, 10);
    expect(h.released).toEqual([`90x:coach:gap:u1:convex hull:${day}`]);
  });
  it("matches taxonomy topics in every domain, DSA included", async () => {
    await noteLibraryGap("u1", "two pointers");
    expect(h.lookups[0]?.[2]).toEqual({ anyDomain: true });
  });
});

describe("libraryGaps and clearLibraryGap", () => {
  it("returns the rows with the date and whether a lesson exists now", async () => {
    h.rows = [{ topic: "convex hull", topicSlug: "alg-convex-hull", asks: 3, lastAskedAt: "2026-10-10T00:00:00Z", lessonExists: true }];
    expect(await libraryGaps()).toEqual(h.rows);
  });
  it("clears one row by its topic", async () => {
    await clearLibraryGap("convex hull");
    expect(sqlOf(h.deleteWhere).params).toEqual(["convex hull"]);
  });
});
