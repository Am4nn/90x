import { describe, expect, it } from "vitest";
import { replyEmail } from "./templates";

const base = {
  to: "Vic <info@viberank.dev>",
  subject: "Re: Hello",
  body: "Thanks for writing.",
  theirFrom: "Vic <info@viberank.dev>",
  theirDate: "2026-10-11T11:02:00+00:00",
  quote: null as string | null,
};

describe("replyEmail", () => {
  it("greets by first name, signs off as the team and carries the footer, in both parts", () => {
    const email = replyEmail(base);
    expect(email.to).toBe(base.to);
    expect(email.subject).toBe("Re: Hello");
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Hi Vic,");
      expect(part).toContain("The 90x team");
      expect(part).toContain("Just reply to this email if you have anything else. It comes straight to us.");
    }
    expect(email.html).toContain("Thanks,<br>The 90x team");
    expect(email.text).toContain("Thanks,\nThe 90x team");
  });

  it("uses Hi there when there is no display name, or none that survives cleaning", () => {
    expect(replyEmail({ ...base, theirFrom: "info@viberank.dev" }).html).toContain("Hi there,");
    expect(replyEmail({ ...base, theirFrom: "<info@viberank.dev>" }).html).toContain("Hi there,");
    expect(replyEmail({ ...base, theirFrom: '"" <info@viberank.dev>' }).text).toContain("Hi there,");
    expect(replyEmail({ ...base, theirFrom: "\u202e:::/// <a@b.test>" }).text).toContain("Hi there,");
  });

  it("takes only the first word of a quoted name, and never lets a hostile name through", () => {
    expect(replyEmail({ ...base, theirFrom: '"Vic Sharma" <a@b.test>' }).text).toContain("Hi Vic,");
    const hostile = replyEmail({ ...base, theirFrom: "Vic<script>alert(1)</script> <a@b.test>" });
    expect(hostile.html).not.toContain("<script>");
    const long = replyEmail({ ...base, theirFrom: `${"x".repeat(80)} <a@b.test>` });
    expect(long.text).toContain(`Hi ${"x".repeat(30)},`);
    expect(long.text).not.toContain("x".repeat(31));
  });

  it("escapes the body, so markup stays text", () => {
    const email = replyEmail({ ...base, body: `<script>alert("x")</script> & <b>bold</b>` });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>bold</b>");
    expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;bold&lt;/b&gt;");
    expect(email.text).toContain(`<script>alert("x")</script>`);
  });

  it("splits paragraphs on blank lines and turns single newlines into line breaks", () => {
    const html = replyEmail({ ...base, body: "one\ntwo\n\n\nthree\r\nfour" }).html;
    expect(html).toContain("one<br>two</p>");
    expect(html).toContain("three<br>four</p>");
    expect(html.match(/one<br>two/g)).toHaveLength(1);
  });

  it("links http(s) URLs with the scheme left off the link text, and nothing else", () => {
    const html = replyEmail({
      ...base,
      body: "See https://90x.amanarya.com/me?a=1&b=2. Also javascript:alert(1) and http://x.test/a).",
    }).html;
    expect(html).toContain('href="https://90x.amanarya.com/me?a=1&amp;b=2"');
    expect(html).toContain(">90x.amanarya.com/me?a=1&amp;b=2</a>.");
    expect(html).toContain('href="http://x.test/a"');
    expect(html).not.toContain('href="javascript');
  });

  it("cannot be broken out of an attribute by a URL", () => {
    const html = replyEmail({ ...base, body: `https://x.test/"onmouseover="alert(1)` }).html;
    expect(html).not.toContain(`"onmouseover`);
  });

  it("quotes their message when asked, escaped, with the date and sender", () => {
    const email = replyEmail({ ...base, quote: "Hello <i>there</i>\nsecond line" });
    expect(email.html).toContain("On Sun, 11 Oct, Vic &lt;info@viberank.dev&gt; wrote:");
    expect(email.html).toContain("Hello &lt;i&gt;there&lt;/i&gt;<br>second line");
    expect(email.html).toContain("border-left:");
    expect(email.text).toContain("On Sun, 11 Oct, Vic <info@viberank.dev> wrote:\n> Hello <i>there</i>\n> second line");
  });

  it("leaves the quote out when not asked, or when there is no text to quote", () => {
    for (const quote of [null, "", "  \n "]) {
      const email = replyEmail({ ...base, quote });
      expect(email.html).not.toContain("wrote:");
      expect(email.text).not.toContain("wrote:");
    }
  });

  it("caps a long quote", () => {
    const email = replyEmail({ ...base, quote: "a".repeat(9000) });
    expect(email.html).not.toContain("a".repeat(4001));
    expect(email.html).toContain("a".repeat(4000));
    expect(email.text).not.toContain("a".repeat(4001));
  });

  it("survives an unreadable date", () => {
    expect(replyEmail({ ...base, theirDate: "", quote: "hi" }).text).toContain("Vic <info@viberank.dev> wrote:");
  });

  it("carries the dark-mode classes and the logo like every other 90x email", () => {
    const html = replyEmail(base).html;
    for (const c of ["x-bg", "x-card", "x-body", "x-rule", "x-mute"]) expect(html).toContain(c);
    expect(html).toContain("icons/icon-192.png");
  });
});
