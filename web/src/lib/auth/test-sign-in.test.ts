import { describe, expect, it } from "vitest";
import { testSignInAllowed } from "./test-sign-in";

const local = { E2E: "1", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", ALLOW_TEST_SIGN_IN: "1" };

describe("testSignInAllowed", () => {
  it("allows the e2e job against local Supabase, with the explicit opt-in", () => {
    expect(testSignInAllowed(local)).toBe(true);
    expect(testSignInAllowed({ ...local, NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" })).toBe(true);
  });
  it("allows a remapped local port, because the port carries no security", () => {
    // `supabase start` remaps when its configured port is taken (54321 -> 64321
    // on one machine here). Pinning the port refused a perfectly local stack
    // while making the gate no safer: what matters is loopback over http.
    expect(testSignInAllowed({ ...local, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:64321" })).toBe(true);
    expect(testSignInAllowed({ ...local, NEXT_PUBLIC_SUPABASE_URL: "http://localhost:8000" })).toBe(true);
  });
  it("refuses without the explicit opt-in, even with everything else set", () => {
    expect(testSignInAllowed({ ...local, ALLOW_TEST_SIGN_IN: undefined })).toBe(false);
    expect(testSignInAllowed({ ...local, ALLOW_TEST_SIGN_IN: "" })).toBe(false);
    expect(testSignInAllowed({ ...local, ALLOW_TEST_SIGN_IN: "true" })).toBe(false);
  });
  it("refuses without E2E=1", () => {
    expect(testSignInAllowed({ ...local, E2E: undefined })).toBe(false);
    expect(testSignInAllowed({ ...local, E2E: "true" })).toBe(false);
    expect(testSignInAllowed({ ...local, E2E: "" })).toBe(false);
  });
  it("refuses on Vercel, even with everything else set", () => {
    expect(testSignInAllowed({ ...local, VERCEL: "1" })).toBe(false);
    expect(testSignInAllowed({ ...local, VERCEL: "" })).toBe(false);
  });
  it("refuses any Supabase that isn't the local CLI stack", () => {
    for (const url of [
      undefined,
      "",
      "https://abcd.supabase.co",
      // A host that merely starts with a loopback address, or merely contains one.
      "http://127.0.0.1:54321.evil.test",
      // No port in the userinfo: with one, this line reads as user:password@host and
      // a credential scanner flags the test fixture as a leaked secret.
      "http://127.0.0.1@evil.test",
      "http://localhost.evil.test:54321",
      "http://notlocalhost:54321",
      "http://evil.test/127.0.0.1:54321",
      // Loopback, but not plain http, and not bare: a hosted project is never
      // loopback, so these are the shapes that could smuggle something else in.
      "https://127.0.0.1:54321",
      "http://127.0.0.1:54321/",
      "http://127.0.0.1",
      "http://[::1]:54321",
    ]) {
      expect(testSignInAllowed({ ...local, NEXT_PUBLIC_SUPABASE_URL: url })).toBe(false);
    }
  });
});
