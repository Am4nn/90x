import { describe, expect, it } from "vitest";
import { landingRedirect } from "./landing-gate";

describe("landingRedirect", () => {
  it("sends a signed-in visitor from the front door to Today", () => {
    expect(landingRedirect("/", true)).toBe("/today");
  });

  it("serves the front door to a signed-out visitor", () => {
    expect(landingRedirect("/", false)).toBeNull();
  });

  it("sends a signed-in visitor from the try page to Today as well, as it does from the front door", () => {
    expect(landingRedirect("/try", true)).toBe("/today");
  });

  it("serves the try page to a signed-out visitor", () => {
    expect(landingRedirect("/try", false)).toBeNull();
  });

  it("leaves every other page alone, signed in or not", () => {
    for (const path of [
      "/today",
      "/feed",
      "/library/topic/caching",
      "/auth/callback",
      "/admin",
      "/sign-in",
      "//",
      "/trying",
      "/try/more",
      "/tryout",
    ]) {
      expect(landingRedirect(path, true), path).toBeNull();
      expect(landingRedirect(path, false), path).toBeNull();
    }
  });
});
