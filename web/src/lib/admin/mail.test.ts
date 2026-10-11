import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const store = new Map<string, unknown>();
let redisDown = false;
const expiries = new Map<string, number>();
vi.mock("@/lib/upstash/redis", () => ({
  redis: () => ({
    get: async (k: string) => {
      if (redisDown) throw new Error("down");
      return store.get(k) ?? null;
    },
    set: async (k: string, v: unknown, opts?: { nx?: boolean; ex?: number }) => {
      if (redisDown) throw new Error("down");
      if (opts?.nx && store.has(k)) return null;
      store.set(k, v);
      if (opts?.ex) expiries.set(k, opts.ex);
      return "OK";
    },
    del: async (k: string) => {
      if (redisDown) throw new Error("down");
      store.delete(k);
    },
    mget: async (...ks: string[]) => {
      if (redisDown) throw new Error("down");
      return ks.map((k) => store.get(k) ?? null);
    },
  }),
}));

import {
  claimReplyLock,
  inboundEmail,
  inboundEmails,
  lastSeenMailAt,
  markMailReplied,
  markMailSeen,
  releaseReplyLock,
  repliedAt,
  repliedIds,
} from "./mail";

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

  it("parses the Message-ID and the reply-to addresses for threading and addressing a reply", async () => {
    vi.stubGlobal(
      "fetch",
      reply({ id: "m1", message_id: "<abc@mail.test>", reply_to: ["r@x.test", 5], created_at: "2024-01-01T00:00:00Z" }),
    );
    expect(await inboundEmail("m1")).toMatchObject({ messageId: "<abc@mail.test>", replyTo: ["r@x.test"] });
    vi.stubGlobal("fetch", reply({ id: "m2", reply_to: "one@x.test" }));
    expect(await inboundEmail("m2")).toMatchObject({ messageId: null, replyTo: ["one@x.test"] });
    vi.stubGlobal("fetch", reply({ id: "m3", message_id: "", reply_to: null }));
    expect(await inboundEmail("m3")).toMatchObject({ messageId: null, replyTo: [] });
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

describe("mail replied marker", () => {
  it("records when a message was answered, per message", async () => {
    expect(await repliedAt("m1")).toBeNull();
    const at = await markMailReplied("m1");
    expect(at).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    expect(await repliedAt("m1")).toBe(at);
    expect(await repliedAt("m2")).toBeNull();
    expect(await repliedIds(["m1", "m2"])).toEqual(new Set(["m1"]));
    expect(await repliedIds([])).toEqual(new Set());
  });

  it("does not throw when Redis is down: nothing is marked, nothing is shown", async () => {
    redisDown = true;
    await expect(markMailReplied("m1")).resolves.toMatch(/^\d{4}-/);
    expect(await repliedAt("m1")).toBeNull();
    expect(await repliedIds(["m1"])).toEqual(new Set());
  });
});

describe("reply lock", () => {
  it("is taken once per message for sixty seconds, and can be given back", async () => {
    expect(await claimReplyLock("m1")).toBe("claimed");
    expect(await claimReplyLock("m1")).toBe("held");
    expect(await claimReplyLock("m2")).toBe("claimed");
    expect([...expiries.values()]).toContain(60);
    await releaseReplyLock("m1");
    expect(await claimReplyLock("m1")).toBe("claimed");
  });

  it("is down, not claimed, when Redis is unavailable, and releasing does not throw", async () => {
    redisDown = true;
    expect(await claimReplyLock("m1")).toBe("down");
    await expect(releaseReplyLock("m1")).resolves.toBeUndefined();
  });
});
