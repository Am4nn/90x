import { describe, expect, it } from "vitest";
import { approvalEmail, friendInviteEmail, problemReportEmail } from "./templates";

describe("problemReportEmail", () => {
  const report = { from: "a@b.test", message: "It <b>broke</b>\nbadly", doing: null, path: "/feed", userAgent: "UA", appVersion: "abc123" };

  it("escapes the reporter's text in the HTML and keeps it raw in the text part", () => {
    const email = problemReportEmail("owner@example.test", report);
    expect(email.html).not.toContain("<b>broke</b>");
    expect(email.html).toContain("&lt;b&gt;broke&lt;/b&gt;<br>badly");
    expect(email.text).toContain("It <b>broke</b>");
  });

  it("carries who, where and which version", () => {
    const email = problemReportEmail("owner@example.test", report);
    for (const part of [email.html, email.text]) {
      expect(part).toContain("a@b.test");
      expect(part).toContain("/feed");
      expect(part).toContain("abc123");
    }
    expect(email.to).toBe("owner@example.test");
  });
});

describe("friendInviteEmail", () => {
  it("names the inviter and carries a real text part", () => {
    const email = friendInviteEmail("friend@example.test", "Aman");
    expect(email.to).toBe("friend@example.test");
    expect(email.subject).toContain("Aman");
    expect(email.html).toContain("Aman");
    expect(email.text).toContain("Aman invited you to 90x.");
    expect(email.text).toContain("Sign in with Google");
  });

  it("tells the reader a reply reaches 90x, in both the HTML and the text part", () => {
    // A line present in only one part is the failure: it once landed in the HTML and
    // the plain-text part silently missed it. It must also name 90x, so a reader does
    // not think they are replying to the friend who invited them.
    const email = friendInviteEmail("friend@example.test", "Aman");
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Reply to this email");
      expect(part).toContain("someone from 90x");
    }
  });

  it("names the inviter by a plain first name only, in every part", () => {
    const email = friendInviteEmail("friend@example.test", `Riya<script>alert("x")</script> Sharma`);
    expect(email.html).not.toContain("<script>");
    expect(email.subject).toBe("Riyascriptalertxscript invited you to 90x");
    expect(email.text).not.toContain("Sharma");
  });

  it("never puts a sender-looking line or a link from the name into the subject", () => {
    const email = friendInviteEmail("friend@example.test", "Your-bank:verify-at-https://evil.example now");
    expect(email.subject).not.toMatch(/[:/]/);
    expect(email.subject.replace(" invited you to 90x", "").length).toBeLessThanOrEqual(30);
    expect(friendInviteEmail("friend@example.test", "\u202e:::").subject).toBe("A friend invited you to 90x");
  });

  it("tells a reader who was not expecting it that they can ignore it", () => {
    const email = friendInviteEmail("friend@example.test", "Riya");
    for (const part of [email.html, email.text]) expect(part).toContain("You can ignore this email.");
  });
});

describe("approvalEmail", () => {
  it("says approved, with a button to open the app", () => {
    const email = approvalEmail("a@example.test", true);
    expect(email.subject).toMatch(/approved/i);
    expect(email.html).toContain("Open 90x");
    expect(email.text).toContain("Your 90x account is approved.");
  });

  it("declines in one line, with no button", () => {
    const email = approvalEmail("a@example.test", false);
    expect(email.subject).toMatch(/account/i);
    expect(email.html).not.toContain("Open 90x");
    expect(email.text).toContain("declined");
  });
});

describe("email copy", () => {
  // The house voice is precise and direct, and em dashes read as machine-written.
  const emails = [
    friendInviteEmail("friend@example.test", "Aman"),
    approvalEmail("a@example.test", true),
    approvalEmail("a@example.test", false),
  ];

  it("uses no em dashes anywhere", () => {
    for (const email of emails) {
      for (const part of [email.html, email.text, email.subject]) {
        expect(part).not.toContain("\u2014");
        expect(part).not.toContain("&mdash;");
      }
    }
  });
});
