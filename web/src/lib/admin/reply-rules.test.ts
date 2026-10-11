import { describe, expect, it } from "vitest";
import { quickReplies, replyRecipient, replySubject } from "./reply-rules";

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
    expect(replyRecipient({ from: "A <a@x.test>", replyTo: [""] })).toBe("A <a@x.test>");
  });

  it("is null when there is nothing to send to", () => {
    expect(replyRecipient({ from: "unknown sender", replyTo: [] })).toBeNull();
  });
});
