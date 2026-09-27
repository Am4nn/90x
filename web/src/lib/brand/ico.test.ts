import { describe, expect, it } from "vitest";
import { encodeIco } from "./ico";

const png = (bytes: number[]) => Buffer.from([0x89, 0x50, 0x4e, 0x47, ...bytes]);

describe("encodeIco", () => {
  it("writes a directory entry per image, then the PNGs in order", () => {
    const small = png([1, 2]);
    const large = png([3, 4, 5]);
    const ico = encodeIco([
      { size: 16, png: small },
      { size: 256, png: large },
    ]);
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);

    const first = 6;
    expect(ico.readUInt8(first)).toBe(16);
    expect(ico.readUInt16LE(first + 6)).toBe(32);
    expect(ico.readUInt32LE(first + 8)).toBe(small.length);
    expect(ico.readUInt32LE(first + 12)).toBe(6 + 2 * 16);

    const second = first + 16;
    // 256 is stored as 0.
    expect(ico.readUInt8(second)).toBe(0);
    expect(ico.readUInt32LE(second + 12)).toBe(6 + 2 * 16 + small.length);

    expect(ico.subarray(6 + 32)).toEqual(Buffer.concat([small, large]));
  });
});
