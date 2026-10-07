import { describe, expect, it } from "vitest";
import { breakGlass, breakGlassGate, LIVE, parseState, switchGate, tidyMessage, visibleMessage } from "./rules";

const page = (pathname: string) => ({ pathname, isAction: false });
const action = (pathname: string) => ({ pathname, isAction: true });

describe("switchGate (the admin switch is on)", () => {
  it.each([
    "/maintenance",
    "/admin",
    "/admin/settings",
    "/auth/callback",
    "/api/test/sign-in",
    "/api/jobs/hourly",
    "/api/health",
    "/privacy",
    "/terms",
    "/delete-account",
    "/offline",
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.webmanifest",
    "/opengraph-image",
    "/icons/icon-192.png",
  ])("keeps %s reachable", (path) => {
    expect(switchGate(page(path))).toBe("open");
  });

  it.each(["/", "/try", "/today", "/feed", "/library/dsa", "/me", "/setup", "/pending", "/sign-in", "/share/abc"])(
    "shows the maintenance page for %s",
    (path) => {
      expect(switchGate(page(path))).toBe("page");
    },
  );

  it.each(["/api/coach/chat", "/api/push/resync", "/api", "/api/unknown"])("answers 503 JSON for %s", (path) => {
    expect(switchGate(page(path))).toBe("api");
  });

  it("blocks a server action posted to any URL, an open one included, except under /admin where the admin gate decides", () => {
    for (const path of ["/today", "/privacy", "/maintenance", "/auth/callback", "/"]) expect(switchGate(action(path)), path).toBe("api");
    expect(switchGate(action("/admin/settings"))).toBe("open");
  });

  it("does not let an encoded or dotted path look open while it routes elsewhere", () => {
    expect(switchGate(page("/auth/..%2ftoday"))).toBe("page");
    expect(switchGate(page("/privacy%2f..%2ftoday"))).toBe("page");
    expect(switchGate(page("/auth/%2e%2e/today"))).toBe("page");
    // Encoded forms of an open path stay open: /%61dmin routes to /admin, whose own gate applies.
    expect(switchGate(page("/%61dmin/settings"))).toBe("open");
  });

  it("does not treat a lookalike as open", () => {
    expect(switchGate(page("/maintenance-x"))).toBe("page");
    expect(switchGate(page("/privacy/extra"))).toBe("page");
    expect(switchGate(page("/administrator"))).toBe("page");
  });
});

describe("breakGlassGate (MAINTENANCE_MODE=1)", () => {
  it("answers only the maintenance page and the uptime check", () => {
    expect(breakGlassGate(page("/maintenance"))).toBe("open");
    expect(breakGlassGate(page("/api/health"))).toBe("open");
  });

  it("blocks admin, sign-in, jobs and the legal pages too", () => {
    for (const path of ["/admin/settings", "/auth/callback", "/privacy", "/", "/today"])
      expect(breakGlassGate(page(path)), path).toBe("page");
    for (const path of ["/api/jobs/hourly", "/api/test/sign-in", "/api/coach/chat"]) expect(breakGlassGate(page(path)), path).toBe("api");
    expect(breakGlassGate(action("/maintenance"))).toBe("api");
    expect(breakGlassGate(action("/admin/settings"))).toBe("api");
  });
});

describe("breakGlass", () => {
  it("is on for 1 or true only", () => {
    expect(breakGlass({ MAINTENANCE_MODE: "1" })).toBe(true);
    expect(breakGlass({ MAINTENANCE_MODE: " TRUE " })).toBe(true);
    for (const value of [undefined, "", "0", "false", "yes", "on"])
      expect(breakGlass({ MAINTENANCE_MODE: value }), String(value)).toBe(false);
  });
});

describe("parseState", () => {
  it("reads a stored state", () => {
    expect(parseState({ on: true, message: "Back by 6pm" })).toEqual({ on: true, message: "Back by 6pm" });
    expect(parseState({ on: true })).toEqual({ on: true, message: "" });
    expect(parseState({ on: false, message: "x" })).toEqual(LIVE);
  });

  it("reads anything malformed as live, so a bad value can never take the app down", () => {
    for (const raw of [null, undefined, "on", 1, true, [], { on: "true" }, { on: 1 }])
      expect(parseState(raw), JSON.stringify(raw)).toEqual(LIVE);
  });
});

describe("visibleMessage", () => {
  it("shows the trimmed message", () => {
    expect(visibleMessage("  Back by 6pm IST.  ")).toBe("Back by 6pm IST.");
  });

  it("shows nothing at all for an empty or blank message: there is no default text", () => {
    for (const m of ["", "   ", "\n\t", null, undefined]) expect(visibleMessage(m)).toBeNull();
  });
});

describe("tidyMessage", () => {
  it("folds the message onto one line", () => {
    expect(tidyMessage("  Back\nby   6pm\t IST ")).toBe("Back by 6pm IST");
  });
});

const post = (pathname: string) => ({ pathname, isAction: false, method: "POST" });

describe("writes without the action header (header-less form posts run as actions too)", () => {
  it("under the switch, refuses a POST to any page path, an open one included, but not to /admin or an API route", () => {
    for (const path of ["/privacy", "/maintenance", "/today", "/terms"]) expect(switchGate(post(path)), path).toBe("api");
    expect(switchGate(post("/admin/settings"))).toBe("open");
    expect(switchGate(post("/api/jobs/hourly"))).toBe("open");
    expect(switchGate(post("/api/coach/chat"))).toBe("api");
    expect(switchGate({ pathname: "/privacy", isAction: false, method: "HEAD" })).toBe("open");
  });

  it("under the break-glass, refuses every write, the maintenance page and health included", () => {
    for (const path of ["/maintenance", "/api/health", "/today"]) expect(breakGlassGate(post(path)), path).toBe("api");
  });
});
