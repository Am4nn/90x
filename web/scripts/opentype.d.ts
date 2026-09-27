// The part of opentype.js 2 that scripts/make-icons.ts uses; the package ships no types.
declare module "opentype.js" {
  interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }
  interface Path {
    getBoundingBox(): BoundingBox;
    toPathData(options: { decimalPlaces: number; flipY: boolean }): string;
  }
  interface Font {
    getPath(text: string, x: number, y: number, fontSize: number): Path;
  }
  export function parse(buffer: ArrayBuffer): Font;
}
