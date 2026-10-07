import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/landing/fonts", () => ({ jetbrains: { variable: "font-jetbrains-var" } }));
vi.mock("@/components/landing/sign-in-buttons", () => ({ SignInNotice: () => null }));

const { MaintenanceView } = await import("./maintenance-view");

const render = (message: string | null, signIn = true) => renderToStaticMarkup(createElement(MaintenanceView, { message, signIn }));

describe("MaintenanceView", () => {
  it("always shows the heading, the reassurance, Check again and the support address", () => {
    const html = render(null);
    expect(html).toContain("<h1");
    expect(html).toContain("90x is down for maintenance.");
    expect(html).toContain("Your progress is safe. We will be back soon.");
    expect(html).toContain(">Check again<");
    expect(html).toContain('href="mailto:support@mail.90x.amanarya.com"');
  });

  it("shows the admin's message, trimmed, when there is one", () => {
    const html = render("  We're upgrading the database, back by 6pm IST.  ");
    expect(html).toContain('data-maintenance="message"');
    expect(html).toContain(">We&#x27;re upgrading the database, back by 6pm IST.<");
  });

  it("renders no message box at all, and no default text, when the message is empty or blank", () => {
    for (const message of [null, "", "   "]) {
      const html = render(message);
      expect(html).not.toContain('data-maintenance="message"');
      expect(html).toBe(render(null));
    }
  });

  it("offers an admin sign-in, except under the break-glass", () => {
    expect(render(null, true)).toContain("Admin? Sign in");
    expect(render(null, false)).not.toContain("Admin? Sign in");
  });

  it("draws the real dot wordmark and a sleeping Ren, not an ASCII stand-in", () => {
    const html = render(null);
    expect(html).toContain('data-landing="wordmark"');
    expect(html).toContain('data-landing="mark-box"');
    // Ren's closed eyes are arcs, not the open eyes' ellipses.
    expect(html).toContain("M7.6 12.4 Q9.1 13.7 10.6 12.4");
    expect(html).not.toContain("(-.-)");
  });
});
