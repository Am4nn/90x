import { describe, expect, it } from "vitest";
import { approvalEmail, friendInviteEmail } from "./templates";

describe("friendInviteEmail", () => {
  it("names the inviter and carries a real text part", () => {
    const email = friendInviteEmail("friend@example.test", "Aman");
    expect(email.to).toBe("friend@example.test");
    expect(email.subject).toContain("Aman");
    expect(email.html).toContain("Aman");
    expect(email.text).toContain("Aman invited you to 90x.");
    expect(email.text).toContain("Sign in with Google");
  });

  it("escapes an attacker-controlled inviter name in the HTML, not in text or subject", () => {
    const email = friendInviteEmail("friend@example.test", `A & B <script>alert("x")</script>`);
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    // Plain text and the subject carry the raw name, not HTML entities.
    expect(email.text).toContain(`A & B <script>alert("x")</script> invited you to 90x.`);
    expect(email.subject).toBe(`A & B <script>alert("x")</script> invited you to 90x`);
  });
});

describe("approvalEmail", () => {
  it("says approved, with a button to open the app", () => {
    const email = approvalEmail("a@example.test", true);
    expect(email.subject).toMatch(/approved/i);
    expect(email.html).toContain("Open 90x");
    expect(email.text).toContain("Your 90x account has been approved.");
  });

  it("declines in one line, with no button", () => {
    const email = approvalEmail("a@example.test", false);
    expect(email.subject).toMatch(/account/i);
    expect(email.html).not.toContain("Open 90x");
    expect(email.text).toContain("declined");
  });
});
