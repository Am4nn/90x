import { describe, expect, it } from "vitest";
import { sampleShape, seedFor } from "./word-sampler";

/** A picture that is solid ink in the left half and clear in the right. */
function halfInk(width: number, height: number): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width / 2; x++) alpha[y * width + x] = 255;
  return alpha;
}

describe("sampleShape", () => {
  it("puts every dot on the ink and none on the clear half", () => {
    const shape = sampleShape(halfInk(200, 100), 200, 100, 400, seedFor("?"));
    expect(shape.dots.length).toBeGreaterThan(60);
    for (const dot of shape.dots) expect(dot.x).toBeLessThan(100);
  });

  it("takes one dot for every 9 pixels of ink in a short picture and one for every 22 in a tall one, up to the cap", () => {
    // Half of 100 by 100 is 5000px of ink, and the picture is under 160px tall.
    const short = sampleShape(halfInk(100, 100), 100, 100, 10000, 1);
    expect(short.dots.length).toBe(Math.round(5000 / 9));
    // Half of 100 by 200 is 10000px of ink, in a taller picture.
    const tall = sampleShape(halfInk(100, 200), 100, 200, 10000, 1);
    expect(tall.dots.length).toBe(Math.round(10000 / 22));
    expect(sampleShape(halfInk(100, 100), 100, 100, 100, 1).dots).toHaveLength(100);
  });

  it("never takes fewer than 60 when there is room", () => {
    const tiny = new Uint8ClampedArray(30 * 30).fill(255);
    expect(sampleShape(tiny, 30, 30, 1000, 1).dots.length).toBeGreaterThanOrEqual(60);
  });

  it("is repeatable: the same picture and seed scatter the same dots", () => {
    const a = sampleShape(halfInk(120, 80), 120, 80, 200, 5);
    const b = sampleShape(halfInk(120, 80), 120, 80, 200, 5);
    expect(b).toEqual(a);
    expect(sampleShape(halfInk(120, 80), 120, 80, 200, 6)).not.toEqual(a);
  });

  it("leaves a picture with no ink with no dots rather than looping for ever", () => {
    expect(sampleShape(new Uint8ClampedArray(100 * 100), 100, 100, 200, 1).dots).toEqual([]);
  });

  it("scatters the soft edge: partial alpha is accepted less often than solid", () => {
    const width = 200;
    const alpha = new Uint8ClampedArray(width * 100);
    // Left third solid, middle third 40% alpha, right third clear.
    for (let y = 0; y < 100; y++) for (let x = 0; x < width; x++) alpha[y * width + x] = x < 66 ? 255 : x < 133 ? 102 : 0;
    const dots = sampleShape(alpha, width, 100, 5000, 3).dots;
    const solid = dots.filter((d) => d.x < 66).length;
    const soft = dots.filter((d) => d.x >= 66 && d.x < 133).length;
    expect(solid).toBeGreaterThan(soft * 3);
  });

  it("gives dots a size between 0.55 and 1.45 and reports how far apart they are", () => {
    const shape = sampleShape(halfInk(200, 100), 200, 100, 400, 9);
    for (const dot of shape.dots) {
      expect(dot.size).toBeGreaterThanOrEqual(0.55);
      expect(dot.size).toBeLessThanOrEqual(1.45);
    }
    expect(shape.spacing).toBeCloseTo(Math.sqrt(10000 / shape.dots.length), 5);
  });
});

describe("seedFor", () => {
  it("is the designer's: 977 a letter, plus 13", () => {
    expect(seedFor("?")).toBe(990);
    expect(seedFor("1·7·14")).toBe(6 * 977 + 13);
  });
});
