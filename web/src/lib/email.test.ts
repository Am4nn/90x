import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/maintenance/flag", () => ({ skippedForMaintenance: async () => false }));

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
