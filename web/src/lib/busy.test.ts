import { describe, expect, it } from "vitest";
import { withBusy } from "./busy";

describe("withBusy", () => {
  it("adds and removes one control without touching the others", () => {
    const a = withBusy(new Set(), "a", true);
    const ab = withBusy(a, "b", true);
    expect([...ab]).toEqual(["a", "b"]);
    expect([...withBusy(ab, "a", false)]).toEqual(["b"]);
  });

  it("returns the same set when nothing changes, so React skips the render", () => {
    const a = withBusy(new Set(), "a", true);
    expect(withBusy(a, "a", true)).toBe(a);
    expect(withBusy(a, "b", false)).toBe(a);
  });

  it("never mutates its input", () => {
    const a: ReadonlySet<string> = new Set(["a"]);
    withBusy(a, "b", true);
    expect([...a]).toEqual(["a"]);
  });
});
