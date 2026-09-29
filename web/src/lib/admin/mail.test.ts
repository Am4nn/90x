import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const store = new Map<string, unknown>();
let redisDown = false;
vi.mock("@/lib/upstash/redis", () => ({
  redis: () => ({
    get: async (k: string) => {
      if (redisDown) throw new Error("down");
      return store.get(k) ?? null;
    },
    set: async (k: string, v: unknown) => {
      if (redisDown) throw new Error("down");
      store.set(k, v);
    },
  }),
}));

import { inboundEmail, inboundEmails, lastSeenMailAt, markMailSeen } from "./mail";

const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  store.clear();
  redisDown = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("RESEND_API_KEY", "re_test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("inboundEmails", () => {
  it("is null, not [], when Resend is unconfigured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await inboundEmails()).toBeNull();
  });

  it("is null when Resend errors or is unreachable", async () => {
    vi.stubGlobal("fetch", reply({ message: "no" }, 500));
    expect(await inboundEmails()).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    expect(await inboundEmails()).toBeNull();
  });

  it("is [] for an empty inbox", async () => {
    vi.stubGlobal("fetch", reply({ data: [] }));
    expect(await inboundEmails()).toEqual([]);
    vi.stubGlobal("fetch", reply({}));
    expect(await inboundEmails()).toEqual([]);
  });

  it("normalises rows, drops junk and sorts newest first across offsets", async () => {
    const fetchMock = reply({
      data: [
        { id: "old", from: "a@x.com", to: ["me@y.com", 4], subject: "", created_at: "2024-02-22T10:00:00.000Z", attachments: [1, 2] },
        "junk",
        null,
        { id: "new", created_at: "2024-02-22T10:30:00+00:00" },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await inboundEmails();
    expect(out?.map((e) => e.id)).toEqual(["new", "old"]);
    expect(out?.[0]).toMatchObject({ from: "unknown sender", subject: "(no subject)", to: [], attachments: 0 });
    expect(out?.[1]).toMatchObject({ to: ["me@y.com"], subject: "(no subject)", attachments: 2 });
    const init = (fetchMock.mock.calls as unknown[][])[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["user-agent"]).toContain("90x");
  });
});

describe("inboundEmail", () => {
  it("returns the detail with text and authentication, and null when missing", async () => {
    vi.stubGlobal(
      "fetch",
      reply({ id: "m1", html: "<b>x</b>", text: "x", authentication: { spf: "pass" }, created_at: "2024-01-01T00:00:00Z" }),
    );
    expect(await inboundEmail("m1")).toMatchObject({ id: "m1", text: "x", html: "<b>x</b>", authentication: { spf: "pass" } });
    vi.stubGlobal("fetch", reply({ id: "m2", html: 3, text: null, authentication: null }));
    expect(await inboundEmail("m2")).toMatchObject({ html: null, text: null, authentication: null });
    vi.stubGlobal("fetch", reply({}, 404));
    expect(await inboundEmail("gone")).toBeNull();
  });

  it("encodes the id into the path", async () => {
    const fetchMock = reply({ id: "a" });
    vi.stubGlobal("fetch", fetchMock);
    await inboundEmail("a/../b");
    expect((fetchMock.mock.calls as unknown[][])[0]?.[0]).toBe("https://api.resend.com/emails/inbound/a%2F..%2Fb");
  });
});

describe("mail seen marker", () => {
  it("round-trips per admin", async () => {
    expect(await lastSeenMailAt("u1")).toBeNull();
    await markMailSeen("u1");
    expect(await lastSeenMailAt("u1")).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    expect(await lastSeenMailAt("u2")).toBeNull();
  });

  it("reads as never-seen and does not throw when Redis is down", async () => {
    redisDown = true;
    expect(await lastSeenMailAt("u1")).toBeNull();
    await expect(markMailSeen("u1")).resolves.toBeUndefined();
  });
});
