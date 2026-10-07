import { describe, expect, it } from "vitest";
import { CODE_LENGTH, generateShareCode, isShareCode } from "./code";

describe("generateShareCode", () => {
  it("is 8 lowercase letters and digits", () => {
    expect(CODE_LENGTH).toBe(8);
    for (let i = 0; i < 500; i++) expect(generateShareCode()).toMatch(/^[a-z0-9]{8}$/);
  });

  it("does not repeat across a few thousand draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) seen.add(generateShareCode());
    expect(seen.size).toBe(3000);
  });

  it("can produce every character of the alphabet", () => {
    let all = "";
    for (let i = 0; i < 3000; i++) all += generateShareCode();
    expect(new Set(all).size).toBe(36);
  });

  it("maps bytes to the alphabet in order and skips the biased tail (252 and up)", () => {
    // 255 and 253 are rejected (256 is not a multiple of 36); 0..7 give a..h.
    const bytes = Uint8Array.from([255, 253, 0, 1, 2, 3, 4, 5, 6, 7]);
    expect(generateShareCode(() => bytes)).toBe("abcdefgh");
    // 35 is the last character, 36 wraps to the first.
    expect(generateShareCode(() => Uint8Array.from([35, 36, 71, 72, 0, 1, 2, 3]))).toBe("9a9aabcd");
  });
});

describe("isShareCode", () => {
  it("accepts an 8-char lowercase alphanumeric code", () => {
    expect(isShareCode("k7m2p9qa")).toBe(true);
    expect(isShareCode("00000000")).toBe(true);
  });

  it.each([
    "",
    "k7m2p9q",
    "k7m2p9qaa",
    "K7M2P9QA",
    "k7m2-9qa",
    "k7m2p9q\n",
    "../etc/p",
    "%6b7m2p9q",
    " k7m2p9q",
    "k7m2p9qa.png",
    "k7m2p9.png",
  ])("rejects %j", (v) => {
    expect(isShareCode(v)).toBe(false);
  });

  it("rejects values that are not strings", () => {
    for (const v of [undefined, null, 12345678, ["k7m2p9qa"], { code: "k7m2p9qa" }]) expect(isShareCode(v)).toBe(false);
  });
});
