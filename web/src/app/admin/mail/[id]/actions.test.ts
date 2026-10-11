import { beforeEach, describe, expect, it, vi } from "vitest";

// The reply action with the viewer, Resend's read, the mailer, the limiter and Redis mocked.

const h = vi.hoisted(() => ({
  viewer: null as { id: string; isAdmin: boolean } | null,
  mail: null as Record<string, unknown> | null,
  sent: [] as { actorId: string; kind: string; email: Record<string, unknown> }[],
  sendResult: { ok: true } as { ok: true } | { ok: false; error: string },
  slot: { allowed: true, retryAfterSec: 0 },
  marked: [] as string[],
  lock: "claimed" as "claimed" | "held" | "down",
  released: 0,
  slots: 0,
}));
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/viewer", () => ({ adminViewer: async () => h.viewer }));
vi.mock("@/lib/admin/mail", () => ({
  inboundEmail: async () => h.mail,
  claimReplyLock: async () => h.lock,
  releaseReplyLock: async () => {
    h.released++;
  },
  markMailReplied: async (id: string) => {
    h.marked.push(id);
    return "2026-10-11T12:31:00.000Z";
  },
}));
vi.mock("@/lib/email", () => ({
  sendEmailChecked: async (input: { actorId: string; kind: string; email: Record<string, unknown> }) => {
    h.sent.push(input);
    return h.sendResult;
  },
}));
vi.mock("@/lib/upstash/rate-limit", () => ({
  takeSlot: async () => {
    h.slots++;
    return h.slot;
  },
}));

const { sendReply } = await import("./actions");

const ok = { id: "m1", subject: "Re: Hello", body: "Thanks!", quote: true };
const mail = (extra: Record<string, unknown> = {}) => ({
  id: "m1",
  from: "Vic <info@viberank.dev>",
  replyTo: [],
  messageId: "<abc@mail.test>",
  subject: "Hello",
  createdAt: "2026-10-11T11:02:00+00:00",
  text: "their words",
  html: null,
  ...extra,
});

beforeEach(() => {
  h.viewer = { id: "admin1", isAdmin: true };
  h.mail = mail();
  h.sent = [];
  h.sendResult = { ok: true };
  h.slot = { allowed: true, retryAfterSec: 0 };
  h.marked = [];
  h.lock = "claimed";
  h.released = 0;
  h.slots = 0;
  revalidatePath.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sendReply", () => {
  it("refuses anyone who is not an admin, and sends nothing", async () => {
    h.viewer = null;
    expect(await sendReply(ok)).toEqual({ error: "Only admins can do that." });
    expect(h.sent).toHaveLength(0);
  });

  it("rejects an empty or too long body or subject", async () => {
    for (const bad of [
      { body: "   " },
      { body: "x".repeat(5001) },
      { subject: " " },
      { subject: "x".repeat(201) },
      { id: "" },
      { subject: "Re: hi\r\nBcc: z@z.test" },
      { subject: "Re: hi\nthere" },
    ]) {
      const r = await sendReply({ ...ok, ...bad });
      expect(r.error).toBeTruthy();
    }
    expect(h.sent).toHaveLength(0);
    expect((await sendReply({ ...ok, body: "x".repeat(5000), subject: "x".repeat(200) })).ok).toBe(true);
  });

  it("sends to the address Resend holds, never one from the form", async () => {
    const r = await sendReply({ ...ok, to: "evil@x.test" } as typeof ok);
    expect(r.ok).toBe(true);
    expect(h.sent[0]?.email.to).toBe("info@viberank.dev");
    expect(h.sent[0]).toMatchObject({ actorId: "admin1", kind: "reply" });
  });

  it("prefers the reply-to address", async () => {
    h.mail = mail({ replyTo: ["real@viberank.dev"] });
    await sendReply(ok);
    expect(h.sent[0]?.email.to).toBe("real@viberank.dev");
  });

  it("sets threading headers only when the message has an id", async () => {
    await sendReply(ok);
    expect(h.sent[0]?.email.headers).toEqual({ "In-Reply-To": "<abc@mail.test>", References: "<abc@mail.test>" });
    h.mail = mail({ messageId: null });
    await sendReply(ok);
    expect(h.sent[1]?.email.headers).toBeUndefined();
  });

  it("sends to one address even when the sender's header lists several", async () => {
    h.mail = mail({ replyTo: ["me@attacker.test, victim@target.test"] });
    await sendReply(ok);
    expect(h.sent[0]?.email.to).toBe("me@attacker.test");
  });

  it("drops the threading headers, and still sends, when the Message-ID is malformed", async () => {
    h.mail = mail({ messageId: "<abc@mail.test>\r\nBcc: z@z.test" });
    const r = await sendReply(ok);
    expect(r.ok).toBe(true);
    expect(h.sent[0]?.email.headers).toBeUndefined();
  });

  it("quotes their text only when asked", async () => {
    await sendReply(ok);
    await sendReply({ ...ok, quote: false });
    expect(String(h.sent[0]?.email.text)).toContain("> their words");
    expect(String(h.sent[1]?.email.text)).not.toContain("their words");
  });

  it("marks the message replied, refreshes, and says to whom and when", async () => {
    const r = await sendReply(ok);
    expect(h.marked).toEqual(["m1"]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/mail", "layout");
    expect(r).toEqual({ ok: true, note: "Reply sent to info@viberank.dev · 2026-10-11 12:31 UTC" });
  });

  it("refuses a send while the message's reply lock is held, before spending a slot", async () => {
    h.lock = "held";
    const r = await sendReply(ok);
    expect(r.error).toMatch(/just replied/i);
    expect(h.sent).toHaveLength(0);
    expect(h.slots).toBe(0);
  });

  it("fails closed, and says why, when the lock cannot be taken", async () => {
    h.lock = "down";
    const r = await sendReply(ok);
    expect(r.error).toMatch(/couldn't check/i);
    expect(r.error).not.toMatch(/minute/i);
    expect(h.sent).toHaveLength(0);
  });

  it("keeps the lock after a send, and gives it back when the send fails or the limit is hit", async () => {
    await sendReply(ok);
    expect(h.released).toBe(0);
    h.sendResult = { ok: false, error: "Couldn't send that." };
    await sendReply(ok);
    expect(h.released).toBe(1);
    h.sendResult = { ok: true };
    h.slot = { allowed: false, retryAfterSec: 600 };
    await sendReply(ok);
    expect(h.released).toBe(2);
  });

  it("offers no reply to an automated sender, and spends nothing", async () => {
    for (const from of ["MAILER-DAEMON@x.test", "Support <no-reply@x.test>", "do-not-reply@x.test"]) {
      h.mail = mail({ from });
      expect((await sendReply(ok)).error).toMatch(/automated/i);
    }
    vi.stubEnv("EMAIL_FROM", "90x <support@mail.90x.test>");
    h.mail = mail({ from: "x@mail.90x.test" });
    expect((await sendReply(ok)).error).toMatch(/automated/i);
    vi.unstubAllEnvs();
    expect(h.sent).toHaveLength(0);
    expect(h.slots).toBe(0);
  });

  it("keeps the admin's text on a failed send: an error, no marker", async () => {
    h.sendResult = { ok: false, error: "Resend refused the send." };
    expect(await sendReply(ok)).toEqual({ error: "Resend refused the send." });
    expect(h.marked).toHaveLength(0);
  });

  it("says when the message or an address is gone", async () => {
    h.mail = null;
    expect((await sendReply(ok)).error).toMatch(/read that message/i);
    h.mail = mail({ from: "unknown sender" });
    expect((await sendReply(ok)).error).toMatch(/address/i);
    expect(h.sent).toHaveLength(0);
  });

  it("does not spend a rate-limit slot on a message it cannot read or answer", async () => {
    h.mail = null;
    await sendReply(ok);
    h.mail = mail({ from: "unknown sender" });
    await sendReply(ok);
    await sendReply({ ...ok, body: "" });
    expect(h.slots).toBe(0);
  });

  it("says the limit could not be checked, rather than that it was reached, when the limiter is down", async () => {
    h.slot = { allowed: false, retryAfterSec: 0 };
    const r = await sendReply(ok);
    expect(r.error).toMatch(/couldn't check/i);
    expect(r.error).not.toMatch(/min\b/);
    expect(h.sent).toHaveLength(0);
  });

  it("stops at the hourly limit before sending", async () => {
    h.slot = { allowed: false, retryAfterSec: 600 };
    const r = await sendReply(ok);
    expect(r.error).toMatch(/10 min/);
    expect(h.sent).toHaveLength(0);
  });
});
