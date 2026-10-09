import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ maintenance: false, sent: [] as string[] }));
vi.mock("@/lib/maintenance/flag", () => ({ skippedForMaintenance: async () => m.maintenance }));
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (input: { subject: string }) => {
        m.sent.push(input.subject);
        return { data: { id: "e1" }, error: null };
      },
    };
  },
}));

const { loggedPayload, sendEmailBestEffort } = await import("./email");

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
