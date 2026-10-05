import { describe, expect, it } from "vitest";
import { bannerDue, DISMISS_DAYS, installMode, isIos, isIosSafari, isStandalone } from "./install";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";

describe("iOS detection", () => {
  it("knows iPhone Safari from iPhone Chrome and Android", () => {
    expect(isIosSafari({ userAgent: IPHONE_SAFARI })).toBe(true);
    expect(isIosSafari({ userAgent: IPHONE_CHROME })).toBe(false);
    expect(isIos({ userAgent: IPHONE_CHROME })).toBe(true);
    expect(isIos({ userAgent: ANDROID })).toBe(false);
  });
  it("treats a touch-screen Mac (iPadOS) as iOS but a desktop Mac as not", () => {
    expect(isIos({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
  });
});

describe("isStandalone", () => {
  it("is true from either iOS's flag or the display-mode query", () => {
    expect(isStandalone(true, false)).toBe(true);
    expect(isStandalone(undefined, true)).toBe(true);
    expect(isStandalone(false, false)).toBe(false);
    expect(isStandalone(undefined, false)).toBe(false);
  });
});

describe("bannerDue", () => {
  const now = Date.UTC(2026, 9, 10);
  it("shows when never dismissed, and again after a week", () => {
    expect(bannerDue(null, now)).toBe(true);
    expect(bannerDue(now - (DISMISS_DAYS * 86_400_000 - 1), now)).toBe(false);
    expect(bannerDue(now - DISMISS_DAYS * 86_400_000, now)).toBe(true);
    expect(bannerDue(Number.NaN, now)).toBe(true);
  });
});

describe("installMode", () => {
  it("offers nothing once installed, the native prompt when we have it, the how-to on iOS Safari", () => {
    expect(installMode({ standalone: true, hasPrompt: true, iosSafari: true })).toBe("none");
    expect(installMode({ standalone: false, hasPrompt: true, iosSafari: false })).toBe("prompt");
    expect(installMode({ standalone: false, hasPrompt: false, iosSafari: true })).toBe("ios");
    expect(installMode({ standalone: false, hasPrompt: false, iosSafari: false })).toBe("none");
  });
});
