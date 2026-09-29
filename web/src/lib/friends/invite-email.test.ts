import { describe, expect, it } from "vitest";
import { normalizeInviteEmail } from "./invite-email";

describe("normalizeInviteEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeInviteEmail("  Friend@Example.COM ")).toBe("friend@example.com");
  });

  it("rejects an empty address with the form's message", () => {
    expect(() => normalizeInviteEmail("   ")).toThrow("Enter an email.");
  });

  it("rejects an address that is not shaped like one", () => {
    expect(() => normalizeInviteEmail("not-an-email")).toThrow("That does not look like an email.");
    expect(() => normalizeInviteEmail("no@domain")).toThrow("That does not look like an email.");
  });
});
