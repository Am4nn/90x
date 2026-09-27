import { describe, expect, it } from "vitest";
import { LAUNCH_IMAGES, launchImageHref, launchImageMedia, launchImagePixels } from "./launch-images";

const iphone14 = { width: 390, height: 844, scale: 3 };

describe("launch images", () => {
  it("names width, height and pixel ratio in the media query, or iOS ignores it", () => {
    expect(launchImageMedia(iphone14)).toBe("(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)");
  });

  it("points at the PNG make-icons writes", () => {
    expect(launchImageHref(iphone14)).toBe("/splash/splash-390x844@3x.png");
  });

  it("is rendered at exact device pixels", () => {
    expect(launchImagePixels(iphone14)).toEqual({ width: 1170, height: 2532 });
  });

  it("covers each device once", () => {
    const keys = LAUNCH_IMAGES.map(launchImageMedia);
    expect(new Set(keys).size).toBe(LAUNCH_IMAGES.length);
    expect(LAUNCH_IMAGES).toHaveLength(10);
  });
});
