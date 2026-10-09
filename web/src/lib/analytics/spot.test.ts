import { describe, expect, it } from "vitest";
import { parseSpot, SIGN_IN_SPOTS, SPOT_COOKIE, spotCookie } from "./spot";

describe("parseSpot", () => {
  it("accepts each sign-in button", () => {
    for (const spot of SIGN_IN_SPOTS) expect(parseSpot(spot)).toBe(spot);
    expect([...SIGN_IN_SPOTS]).toEqual(["hero", "close", "try", "maintenance"]);
  });
  it("reads anything else as nothing", () => {
    for (const raw of ["", "TRY", "Hero", "top", " try", "try;x", "nope", undefined, null]) expect(parseSpot(raw)).toBeNull();
  });
});

describe("spotCookie", () => {
  it("lasts an hour, is first-party and Lax", () => {
    expect(spotCookie("try", false)).toBe(`${SPOT_COOKIE}=try; Path=/; Max-Age=3600; SameSite=Lax`);
  });
  it("adds Secure on https", () => {
    expect(spotCookie("hero", true)).toBe(`${SPOT_COOKIE}=hero; Path=/; Max-Age=3600; SameSite=Lax; Secure`);
  });
});
