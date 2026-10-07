import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LaunchGatePanel } from "./launch-gate";

// The Meter fill is the only element with exactly these classes, so this pins the bar tint apart from the chip.
const fill = (html: string) => /class="h-full rounded-full (bg-[a-z]+)" style/.exec(html)?.[1];

const render = (returners: number, today: string) =>
  renderToStaticMarkup(
    createElement(LaunchGatePanel, { counts: { launchDate: "2026-10-12", signups: 64, activated: 31, returners }, today }),
  );

describe("LaunchGatePanel", () => {
  it("is green and on track at pace", () => {
    const html = render(2, "2026-10-21");
    expect(html).toContain("border-ok/35 bg-ok/10 text-ok");
    expect(html).toContain("on track");
    expect(html).toContain("Day 9 of 30");
    expect(html).toContain(">pace for day 9: 2 of 20<");
    expect(html).not.toContain("appear before day 7");
    expect(fill(html)).toBe("bg-ok");
  });

  it("before day 7 it is on track with 0 returners and says why", () => {
    const html = render(0, "2026-10-18");
    expect(html).toContain("on track");
    expect(html).toContain("Day 6 of 30");
    expect(html).toContain(">pace for day 6: 0 of 20<");
    expect(html).toContain("Returners can&#x27;t appear before day 7.");
    expect(render(0, "2026-10-19")).not.toContain("appear before day 7");
  });

  it("says Launches for a future date and Launched otherwise", () => {
    expect(render(0, "2026-10-05")).toContain("Launches");
    expect(render(0, "2026-10-12")).toContain("Launched");
    expect(render(0, "2026-10-12")).not.toContain("Launches");
  });

  it("is amber when behind pace", () => {
    const html = render(1, "2026-10-21");
    expect(html).toContain("border-warn/35 bg-warn/10 text-warn");
    expect(html).toContain("behind pace");
    expect(html).toContain(">pace for day 9: 2 of 20<");
    expect(fill(html)).toBe("bg-warn");
  });

  it("is red once the window closed below target and shows Day 30 of 30", () => {
    const html = render(7, "2026-11-11");
    expect(html).toContain("border-bad/35 bg-bad/10 text-bad");
    expect(html).toContain("window closed below target");
    expect(html).toContain("Day 30 of 30");
    expect(html).toContain(">window closed<");
    expect(html).not.toContain("pace for day");
    expect(fill(html)).toBe("bg-bad");
  });

  it("is green with target met once the window closed with 20", () => {
    const html = render(20, "2026-11-11");
    expect(html).toContain("border-ok/35 bg-ok/10 text-ok");
    expect(html).toContain("target met");
    expect(html).toContain(">window closed<");
    expect(fill(html)).toBe("bg-ok");
  });

  it("shows no percent-of-target caption and a named progress bar", () => {
    const html = render(7, "2026-10-21");
    expect(html).not.toContain("%</");
    expect(html).toContain('aria-label="Week-2 returners"');
    expect(html).toContain('aria-valuetext="7 of 20"');
  });
});
