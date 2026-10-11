import { afterEach, describe, expect, it, vi } from "vitest";
import { quickReplies, replyRecipient, replySubject, replyWarnings, unreplyable } from "./reply-rules";

describe("quickReplies", () => {
  const replies = quickReplies();
  const text = (label: string) => replies.find((r) => r.label === label)?.text;

  it("has the six presets in order", () => {
    expect(replies.map((r) => r.label)).toEqual(["Thanks", "Looking into it", "Fixed", "Feature idea", "You're in", "No thanks"]);
  });

  it("carries the exact copy", () => {
    expect(text("Thanks")).toBe("Thanks for writing in! We've read your message and we'll get back to you soon.");
    expect(text("Looking into it")).toBe(
      "Thanks for flagging this. We're looking into it now and will let you know as soon as it's sorted.",
    );
    expect(text("Fixed")).toBe("Good news: this is fixed now. Give the app a refresh, and if you still see it, just reply here.");
    expect(text("Feature idea")).toBe("Love this idea, thank you. We've added it to the list and we'll let you know if it ships.");
    expect(text("No thanks")).toBe(
      "Thanks for thinking of 90x. It's not something we're looking at right now, but we appreciate you reaching out.",
    );
  });

  it("points You're in at the site URL", () => {
    expect(text("You're in")).toMatch(/^You're in! Your account is approved, so you can sign in at https?:\/\/\S+ and start your plan\.$/);
  });
});

describe("replySubject", () => {
  it("prefixes Re: once", () => {
    expect(replySubject("Hello")).toBe("Re: Hello");
    expect(replySubject("Re: Hello")).toBe("Re: Hello");
    expect(replySubject("RE: Hello")).toBe("RE: Hello");
    expect(replySubject("re:hello")).toBe("re:hello");
    expect(replySubject("Reply needed")).toBe("Re: Reply needed");
  });
});

describe("replyRecipient", () => {
  it("prefers the first reply-to address, else the sender", () => {
    expect(replyRecipient({ from: "a@x.test", replyTo: ["b@x.test", "c@x.test"] })).toBe("b@x.test");
    expect(replyRecipient({ from: "a@x.test", replyTo: [] })).toBe("a@x.test");
    expect(replyRecipient({ from: "A <a@x.test>", replyTo: [""] })).toBe("a@x.test");
  });

  it("returns exactly one bare address, never a second mailbox or a display name", () => {
    expect(replyRecipient({ from: "a@x.test", replyTo: ["Me <me@attacker.test>, victim@target.test"] })).toBe("me@attacker.test");
    expect(replyRecipient({ from: "a@x.test", replyTo: ["me@attacker.test, victim@target.test"] })).toBe("me@attacker.test");
    expect(replyRecipient({ from: '"Doe, John" <j@x.test>', replyTo: [] })).toBe("j@x.test");
    expect(replyRecipient({ from: "A <a@x.test>, B <b@y.test>", replyTo: [] })).toBe("a@x.test");
  });

  it("refuses an address with a control character or no domain", () => {
    expect(replyRecipient({ from: "a@x.test\r\nbcc: z@z.test", replyTo: [] })).toBeNull();
    expect(replyRecipient({ from: "a@", replyTo: [] })).toBeNull();
    expect(replyRecipient({ from: "<a b@x.test>", replyTo: [] })).toBeNull();
  });

  it("is null when there is nothing to send to", () => {
    expect(replyRecipient({ from: "unknown sender", replyTo: [] })).toBeNull();
  });
});

describe("replySubject prefixes", () => {
  it("treats Re:, RE:, AW:, SV: and Re[2]: as already prefixed", () => {
    for (const s of ["Re: x", "RE: x", "AW: x", "aw: x", "SV: x", "Re[2]: x", "RE[10]: x"]) expect(replySubject(s)).toBe(s);
  });

  it("still prefixes forwards and ordinary subjects", () => {
    expect(replySubject("Fwd: x")).toBe("Re: Fwd: x");
    expect(replySubject("Record")).toBe("Re: Record");
    expect(replySubject("Re x")).toBe("Re: Re x");
  });

  it("caps the prefilled subject at 200 characters so the first send cannot fail on length", () => {
    expect(replySubject("x".repeat(500))).toHaveLength(200);
    expect(replySubject("Re: " + "x".repeat(500))).toHaveLength(200);
  });
});

describe("unreplyable", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is true for mailer-daemon, postmaster and the no-reply spellings, in any case", () => {
    for (const a of [
      "mailer-daemon@x.test",
      "MAILER-DAEMON@x.test",
      "postmaster@x.test",
      "noreply@x.test",
      "no-reply@x.test",
      "NoReply@x.test",
      "donotreply@x.test",
      "do-not-reply@x.test",
      "Do-Not-Reply@x.test",
    ]) {
      expect(unreplyable(a)).toBe(true);
    }
  });

  it("is false for a person, and for a local part that only contains one of those words", () => {
    for (const a of ["vic@x.test", "noreply-fan@x.test", "support@x.test", "my.postmaster@x.test"]) expect(unreplyable(a)).toBe(false);
  });

  it("is true for an address on the domain the app sends from", () => {
    vi.stubEnv("EMAIL_FROM", "90x <support@mail.90x.test>");
    expect(unreplyable("anyone@mail.90x.test")).toBe(true);
    expect(unreplyable("anyone@MAIL.90X.TEST")).toBe(true);
    expect(unreplyable("anyone@90x.test")).toBe(false);
    expect(unreplyable("anyone@other.test")).toBe(false);
  });

  it("does not treat everything as the own domain when EMAIL_FROM is unset or odd", () => {
    vi.stubEnv("EMAIL_FROM", "");
    expect(unreplyable("anyone@other.test")).toBe(false);
    vi.stubEnv("EMAIL_FROM", "not an address");
    expect(unreplyable("anyone@other.test")).toBe(false);
  });
});

describe("replyWarnings", () => {
  const pass = { spf: "pass", dkim: "pass", dmarc: "pass" };

  it("is empty when the reply goes to the sender and the checks pass, or there is no check data", () => {
    expect(replyWarnings({ from: "Vic <v@x.test>", authentication: pass }, "v@x.test")).toEqual([]);
    expect(replyWarnings({ from: "v@x.test", authentication: null }, "V@X.test")).toEqual([]);
  });

  it("warns when the reply address is not the sender's", () => {
    expect(replyWarnings({ from: "Vic <v@x.test>", authentication: pass }, "other@y.test")).toEqual([
      "Replies go to other@y.test, not the sender v@x.test.",
    ]);
  });

  it("warns when any of SPF, DKIM or DMARC is not pass", () => {
    for (const bad of [{ spf: "fail" }, { dkim: "none" }, { dmarc: "softfail" }, { SPF: "Neutral" }]) {
      expect(replyWarnings({ from: "v@x.test", authentication: { ...pass, ...bad } }, "v@x.test")).toEqual([
        "This message failed sender checks.",
      ]);
    }
  });

  it("can give both warnings", () => {
    expect(replyWarnings({ from: "v@x.test", authentication: { spf: "fail" } }, "o@y.test")).toHaveLength(2);
  });
});
