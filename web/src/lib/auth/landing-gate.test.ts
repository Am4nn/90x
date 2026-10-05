import { describe, expect, it } from "vitest";
import { landingRedirect } from "./landing-gate";

describe("landingRedirect", () => {
  it("sends a signed-in visitor from the front door to Today", () => {
    expect(landingRedirect("/", true)).toBe("/today");
  });

  it("serves the front door to a signed-out visitor", () => {
    expect(landingRedirect("/", false)).toBeNull();
  });

  it("leaves every other page alone, signed in or not", () => {
    for (const path of ["/today", "/feed", "/library/topic/caching", "/auth/callback", "/admin", "/sign-in", "//"]) {
      expect(landingRedirect(path, true), path).toBeNull();
      expect(landingRedirect(path, false), path).toBeNull();
    }
  });
});
