import { beforeEach, describe, expect, it, vi } from "vitest";

// The reply action with the viewer, Resend's read, the mailer, the limiter and Redis mocked.

const h = vi.hoisted(() => ({
  viewer: null as { id: string; isAdmin: boolean } | null,
  mail: null as Record<string, unknown> | null,
  sent: [] as { actorId: string; kind: string; email: Record<string, unknown> }[],
  sendResult: { ok: true } as { ok: true } | { ok: false; error: string },
  slot: { allowed: true, retryAfterSec: 0 },
  marked: [] as string[],
  markThrows: false,
}));
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/viewer", () => ({ adminViewer: async () => h.viewer }));
vi.mock("@/lib/admin/mail", () => ({
  inboundEmail: async () => h.mail,
  markMailReplied: async (id: string) => {
    if (h.markThrows) throw new Error("redis down");
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
vi.mock("@/lib/upstash/rate-limit", () => ({ takeSlot: async () => h.slot }));

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
  h.markThrows = false;
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
    for (const bad of [{ body: "   " }, { body: "x".repeat(5001) }, { subject: " " }, { subject: "x".repeat(201) }, { id: "" }]) {
      const r = await sendReply({ ...ok, ...bad });
      expect(r.error).toBeTruthy();
    }
    expect(h.sent).toHaveLength(0);
    expect((await sendReply({ ...ok, body: "x".repeat(5000), subject: "x".repeat(200) })).ok).toBe(true);
  });

  it("sends to the address Resend holds, never one from the form", async () => {
    const r = await sendReply({ ...ok, to: "evil@x.test" } as typeof ok);
    expect(r.ok).toBe(true);
    expect(h.sent[0]?.email.to).toBe("Vic <info@viberank.dev>");
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
    expect(r).toEqual({ ok: true, note: "Reply sent to Vic <info@viberank.dev> · 2026-10-11 12:31 UTC" });
  });

  it("still succeeds when the marker cannot be written", async () => {
    h.markThrows = true;
    const r = await sendReply(ok);
    expect(r.ok).toBe(true);
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

  it("stops at the hourly limit before sending", async () => {
    h.slot = { allowed: false, retryAfterSec: 600 };
    const r = await sendReply(ok);
    expect(r.error).toMatch(/10 min/);
    expect(h.sent).toHaveLength(0);
  });
});
