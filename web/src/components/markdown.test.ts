import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./markdown";

const render = (md: string) => renderToStaticMarkup(createElement(Markdown, null, md));

describe("Markdown", () => {
  it("never renders raw HTML as elements", () => {
    const html = render(`<img src=x onerror=alert(1)> <script>alert(1)</script>`);
    // Stripped, never an actual element or a live event handler.
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror=");
  });

  it("neutralises a javascript: link", () => {
    const html = render("[click](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });

  it("keeps a safe link", () => {
    const html = render("[docs](https://example.com)");
    expect(html).toContain("https://example.com");
  });

  it("strips the src from a non-https image, so a tracking pixel never loads", () => {
    const html = render("![tracker](http://tracker.example/p.png)");
    expect(html).not.toContain("http://tracker.example");
  });
});
