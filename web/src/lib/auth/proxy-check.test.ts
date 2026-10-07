import { describe, expect, it } from "vitest";
import { needsVerifiedUser } from "./proxy-check";

describe("needsVerifiedUser", () => {
  it("verifies the front door, where a signed-in visitor is sent on to Today", () => {
    expect(needsVerifiedUser("/")).toBe(true);
  });

  it("verifies the try page too, where a signed-in visitor is sent on to Today", () => {
    expect(needsVerifiedUser("/try")).toBe(true);
    expect(needsVerifiedUser("/try/more")).toBe(false);
    expect(needsVerifiedUser("/trying")).toBe(false);
  });

  it("verifies every /admin path, however it is spelled", () => {
    for (const path of ["/admin", "/admin/users", "/admin/cards/flagged", "/%61dmin", "/%2561dmin/users"])
      expect(needsVerifiedUser(path)).toBe(true);
  });

  it("lets the public legal pages through untouched, signed in or not", () => {
    for (const path of ["/privacy", "/terms", "/delete-account"]) expect(needsVerifiedUser(path)).toBe(false);
  });

  it("leaves app pages to the page's own check, so the proxy makes no network call for them", () => {
    for (const path of ["/today", "/feed", "/coach", "/me/settings", "/library/topic/joins", "/administrator-notes"])
      expect(needsVerifiedUser(path)).toBe(false);
  });
});
