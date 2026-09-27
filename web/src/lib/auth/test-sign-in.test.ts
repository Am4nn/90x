import { describe, expect, it } from "vitest";
import { testSignInAllowed } from "./test-sign-in";

const local = { E2E: "1", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" };

describe("testSignInAllowed", () => {
  it("allows the e2e job against local Supabase", () => {
    expect(testSignInAllowed(local)).toBe(true);
    expect(testSignInAllowed({ ...local, NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" })).toBe(true);
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
      "http://127.0.0.1:54321.evil.test",
      "http://localhost:54322",
      "https://127.0.0.1:54321",
      "http://127.0.0.1:54321/",
    ]) {
      expect(testSignInAllowed({ ...local, NEXT_PUBLIC_SUPABASE_URL: url })).toBe(false);
    }
  });
});
