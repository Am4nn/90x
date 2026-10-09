import { describe, expect, it } from "vitest";
import { accountDeletedByAdminEmail, accountDeletedEmail, approvalEmail, friendInviteEmail, problemReportEmail } from "./templates";

/** Every part of an email: subject, HTML and text. */
const parts = (e: { subject: string; html: string; text: string }) => [e.subject, e.html, e.text];

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

  it("says where to accept the invite, and nothing about invite-only or approval", () => {
    const email = friendInviteEmail("friend@example.test", "Ana");
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Sign in with Google, then accept the invite on your Me page.");
      expect(part).not.toMatch(/invite-only|approv/i);
    }
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
  it("says You're in, with a button to open the app", () => {
    const email = approvalEmail("a@example.test");
    expect(email.to).toBe("a@example.test");
    expect(email.subject).toBe("You're in: your 90x account is ready");
    expect(email.html).toContain("You're in");
    expect(email.html).toContain("Sign in to set up your plan.");
    expect(email.html).toContain("Open 90x");
    expect(email.text).toContain("You're in");
    expect(email.text).toContain("Sign in to set up your plan.");
    expect(email.text).toContain("Open 90x: ");
    for (const part of parts(email)) expect(part).not.toMatch(/approved|declined|campaign/i);
  });
});

describe("accountDeletedByAdminEmail", () => {
  const email = accountDeletedByAdminEmail("gone@example.test");

  it("carries the deleted-by-admin copy in the HTML and the text part, with no button", () => {
    expect(email.to).toBe("gone@example.test");
    expect(email.subject).toBe("Your 90x account was deleted");
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Your 90x account was deleted");
      expect(part).toContain(
        "We deleted your 90x account and everything stored with it: answers, check-ins, Coach chats and memory, and progress. This can't be undone.",
      );
      expect(part).toContain("If you didn't expect this, reply to this email.");
    }
    expect(email.html).not.toContain("Open 90x");
    expect(email.html).not.toContain("<a ");
  });
});

describe("accountDeletedEmail", () => {
  const email = accountDeletedEmail("me@example.test");

  it("carries the deleted-by-you copy in the HTML and the text part, with no button", () => {
    expect(email.to).toBe("me@example.test");
    expect(email.subject).toBe("Your 90x account is deleted");
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Your 90x account is deleted");
      expect(part).toContain(
        "You deleted your 90x account. Your answers, check-ins, Coach chats and memory, and progress are gone from our database, and from our backups within 14 days.",
      );
      expect(part).toContain("You can come back any time: signing in again starts a new account.");
    }
    expect(email.html).not.toContain("Open 90x");
    expect(email.html).not.toContain("<a ");
  });
});

describe("email copy", () => {
  // The house voice is precise and direct, and em dashes read as machine-written.
  const emails = [
    friendInviteEmail("friend@example.test", "Aman"),
    approvalEmail("a@example.test"),
    accountDeletedByAdminEmail("a@example.test"),
    accountDeletedEmail("a@example.test"),
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
