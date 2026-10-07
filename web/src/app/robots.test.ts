import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots", () => {
  const rules = robots().rules as {
    userAgent: string;
    allow: string[];
    disallow: string[];
  };

  it("allows the four public pages", () => {
    expect(rules.allow).toEqual(["/", "/try", "/privacy", "/terms"]);
  });

  it("disallows every signed-in and utility route, and none of the public ones", () => {
    for (const path of [
      "/api/",
      "/auth/",
      "/today",
      "/feed",
      "/coach",
      "/library",
      "/me",
      "/friends",
      "/admin",
      "/setup",
      "/pending",
      "/offline",
      "/sign-in",
      "/delete-account",
    ]) {
      expect(rules.disallow, path).toContain(path);
    }
    for (const open of rules.allow.filter((p) => p !== "/")) expect(rules.disallow).not.toContain(open);
  });

  it("keeps /api/ disallowed, the share card included", () => {
    expect(rules.disallow).toContain("/api/");
    expect(rules.allow).not.toContain("/api/share/");
  });

  it("points at the sitemap", () => {
    expect(robots().sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
