import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Busy } from "./form";

const render = (busy: boolean, swap: boolean, label: string) => renderToStaticMarkup(Busy({ busy, swap, children: label }));

describe("Busy", () => {
  it("puts the spinner before the label on a text button", () => {
    const html = render(true, false, "Save");
    expect(html).toContain("animate-spin");
    expect(html).toContain("Save");
    expect(html.indexOf("animate-spin")).toBeLessThan(html.indexOf("Save"));
  });
  it("swaps an icon for the spinner, never both", () => {
    const html = render(true, true, "↑");
    expect(html).toContain("animate-spin");
    expect(html).not.toContain("↑");
  });
  it("shows the icon alone when not busy", () => {
    expect(render(false, true, "↑")).toBe("↑");
  });
});
