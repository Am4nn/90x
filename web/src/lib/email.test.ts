import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  maintenance: false,
  sent: [] as string[],
  inputs: [] as Record<string, unknown>[],
  refuse: null as string | null,
}));
vi.mock("@/lib/maintenance/flag", () => ({ skippedForMaintenance: async () => m.maintenance }));
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (input: { subject: string }) => {
        m.sent.push(input.subject);
        m.inputs.push(input);
        if (m.refuse) return { data: null, error: { name: "validation_error", message: m.refuse } };
        return { data: { id: "e1" }, error: null };
      },
    };
  },
}));

const { loggedPayload, sendEmailBestEffort, sendEmailChecked } = await import("./email");

describe("the email send log", () => {
  it("prints only allowlisted, plain fields of the payload", () => {
    expect(
      loggedPayload({
        invite_id: "i1",
        status: "approved",
        bulk: true,
        spent: 3.5,
        email: "someone@example.test",
        path: "/review?checkin=1",
        nested: { a: 1 },
      }),
    ).toEqual({ invite_id: "i1", status: "approved", bulk: true, spent: 3.5 });
  });

  it("never prints an address from the payload when a send fails", async () => {
    delete process.env.RESEND_API_KEY;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await sendEmailBestEffort({
      actorId: "u1",
      kind: "invite",
      email: { to: "someone@example.test", subject: "s", html: "h", text: "t" },
      payload: { invite_id: "i1", email: "someone@example.test" },
    });
    expect(spy).toHaveBeenCalledOnce();
    expect(JSON.stringify(spy.mock.calls[0])).not.toContain("someone@example.test");
    spy.mockRestore();
  });
});

/** One send of `kind`, with the subject set to the kind so the test can tell which went out. */
const send = (kind: string, evenInMaintenance?: boolean) =>
  sendEmailBestEffort({
    actorId: "u1",
    kind,
    email: { to: "a@example.test", subject: kind, html: "h", text: "t" },
    payload: {},
    evenInMaintenance,
  });

describe("email during maintenance", () => {
  it("skips an ordinary email, and sends one marked evenInMaintenance (the account-deleted notices)", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "90x <hi@example.test>";
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    m.maintenance = true;
    m.sent = [];
    await send("invite");
    await send("account-deleted", true);
    expect(m.sent).toEqual(["account-deleted"]);
    m.maintenance = false;
    await send("invite");
    expect(m.sent).toEqual(["account-deleted", "invite"]);
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });
});

const mail = (extra: Record<string, unknown> = {}) => ({
  actorId: "admin1",
  kind: "reply",
  email: { to: "a@example.test", subject: "Re: hi", html: "h", text: "t", ...extra },
});

describe("sendEmailChecked", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "90x <hi@example.test>";
    m.maintenance = false;
    m.refuse = null;
    m.sent = [];
    m.inputs = [];
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    vi.restoreAllMocks();
  });

  it("reports a send as ok and passes the headers to Resend", async () => {
    const headers = { "In-Reply-To": "<a@b>", References: "<a@b>" };
    expect(await sendEmailChecked(mail({ headers }))).toEqual({ ok: true });
    expect(m.inputs[0]).toMatchObject({ headers, replyTo: "90x <hi@example.test>", from: "90x <hi@example.test>" });
  });

  it("refuses with a fixed line during maintenance, and sends nothing", async () => {
    m.maintenance = true;
    const r = await sendEmailChecked(mail());
    expect(r).toEqual({ ok: false, error: "The app is in maintenance, so nothing was sent." });
    expect(m.sent).toHaveLength(0);
  });

  it("answers a Resend refusal with a fixed line, and never prints Resend's text or the address", async () => {
    m.refuse = "The address a@example.test is not allowed";
    const r = await sendEmailChecked(mail());
    expect(r).toEqual({ ok: false, error: "Couldn't send that. Your text is kept, try again." });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("a@example.test");
  });

  it("reports unset configuration rather than throwing", async () => {
    delete process.env.RESEND_API_KEY;
    expect((await sendEmailChecked(mail())).ok).toBe(false);
  });

  it("refuses a line break or control character in the subject or a header, before Resend sees it", async () => {
    for (const email of [
      mail({ subject: "Re: hi\r\nBcc: z@z.test" }),
      mail({ subject: "Re: hi\n" }),
      mail({ headers: { "In-Reply-To": "<a@b>\r\nBcc: z@z.test" } }),
      mail({ headers: { References: "<a\u0000@b>" } }),
    ]) {
      expect((await sendEmailChecked(email)).ok).toBe(false);
    }
    expect(m.sent).toHaveLength(0);
  });
});
