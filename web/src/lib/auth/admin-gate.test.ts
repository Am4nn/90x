import { describe, expect, it } from "vitest";
import { adminDecision, isAdminPath } from "./admin-gate";

describe("isAdminPath", () => {
  it.each(["/admin", "/admin/", "/admin/users", "/admin/cards/123", "//admin/users", "/%61dmin/users", "/%2561dmin", "/admin%2Fusers"])(
    "%s is an admin path",
    (p) => expect(isAdminPath(p)).toBe(true),
  );

  it.each(["/", "/today", "/administrator", "/admins", "/me/admin", "/library/admin", "/%E0%A4%A"])("%s is not", (p) =>
    expect(isAdminPath(p)).toBe(false),
  );
});

describe("adminDecision", () => {
  it("lets an approved admin through", () => {
    expect(adminDecision({ signedIn: true, status: "approved", isAdmin: true })).toBe("pass");
  });

  it("sends a signed-out visitor to sign in", () => {
    expect(adminDecision({ signedIn: false, status: null, isAdmin: false })).toBe("sign-in");
  });

  it.each([
    ["an approved non-admin", "approved", false],
    ["a pending admin flag", "pending", true],
    ["a rejected admin flag", "rejected", true],
    ["a user with no approval row", null, false],
  ] as const)("gives %s the 404 page", (_, status, isAdmin) => {
    expect(adminDecision({ signedIn: true, status, isAdmin })).toBe("not-found");
  });
});
