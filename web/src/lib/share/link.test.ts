import { describe, expect, it } from "vitest";
import { captureSource } from "@/lib/analytics/source";
import { cardPath, inviteUrl, shareMode, VERSION } from "./link";

const origin = "https://90x.amanarya.com";

describe("inviteUrl", () => {
  it("is the landing page with the share source and the code as campaign", () => {
    expect(inviteUrl(origin, "k7m2p9qa")).toBe("https://90x.amanarya.com/?utm_source=share&utm_medium=invite&utm_campaign=k7m2p9qa");
  });

  it("ignores a path or trailing slash on the origin", () => {
    expect(inviteUrl("http://localhost:3000/", "k7m2p9qa")).toBe(
      "http://localhost:3000/?utm_source=share&utm_medium=invite&utm_campaign=k7m2p9qa",
    );
  });

  it("refuses a malformed code, so a bad value never becomes a link", () => {
    expect(() => inviteUrl(origin, "NOPE")).toThrow();
  });

  it("is captured by the existing signup-source capture, unchanged", () => {
    const url = new URL(inviteUrl(origin, "k7m2p9qa"));
    expect(captureSource({ url, referer: null, host: "90x.amanarya.com", hasCookie: false })).toEqual({
      source: "share",
      medium: "invite",
      campaign: "k7m2p9qa",
      referrer: null,
    });
  });
});

describe("cardPath", () => {
  it("is the public image route", () => {
    expect(cardPath("k7m2p9qa")).toBe("/api/share/k7m2p9qa");
  });

  it("changes with the version, so a card cached before the day was finished is never reused", () => {
    expect(cardPath("k7m2p9qa", "23-20")).toBe("/api/share/k7m2p9qa?v=23-20");
    expect(cardPath("k7m2p9qa", "23-20")).not.toBe(cardPath("k7m2p9qa", "23-21"));
  });

  it("builds a valid versioned path for long campaigns, as the share row does from day 100", () => {
    for (const [day, finished] of [
      [100, 73],
      [120, 120],
      [365, 365],
    ]) {
      const path = cardPath("k7m2p9qa", `${day}-${finished}`);
      expect(path).toBe(`/api/share/k7m2p9qa?v=${day}-${finished}`);
      expect(VERSION.test(`${day}-${finished}`)).toBe(true);
    }
    expect(() => cardPath("k7m2p9qa", "1000-1")).toThrow();
  });

  it("refuses a version the route would reject, so the card never 404s", () => {
    expect(() => cardPath("k7m2p9qa", "23")).toThrow();
    expect(() => cardPath("k7m2p9qa", "a-b")).toThrow();
  });
});

describe("shareMode", () => {
  const file = new File(["x"], "card.png", { type: "image/png" });

  it("shares the file when the device can", () => {
    expect(shareMode({ share: () => {}, canShare: () => true }, file)).toBe("files");
  });

  it("falls back to the link when the sheet cannot take files", () => {
    expect(shareMode({ share: () => {}, canShare: () => false }, file)).toBe("link");
    expect(shareMode({ share: () => {} }, file)).toBe("link");
  });

  it("falls back to the link when the card has not loaded", () => {
    expect(shareMode({ share: () => {}, canShare: () => true }, null)).toBe("link");
  });

  it("is none without a share sheet (most desktop browsers)", () => {
    expect(shareMode({}, file)).toBe("none");
    expect(shareMode({ canShare: () => true }, file)).toBe("none");
  });
});
