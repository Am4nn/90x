import { describe, expect, it } from "vitest";
import { parseOptions } from "./options";

describe("parseOptions", () => {
  it("reads a flat list for pick one and order", () => {
    expect(parseOptions("pick_one", ["A", "B", "C"])).toEqual({ items: ["A", "B", "C"], targets: null, template: null });
    expect(parseOptions("order", ["step 1", "step 2"])).toEqual({ items: ["step 1", "step 2"], targets: null, template: null });
  });

  it("reads the left and right sides of a match", () => {
    expect(parseOptions("match", { left: ["Atomicity", "Consistency"], right: ["all or nothing", "stays the same"] })).toEqual({
      items: ["Atomicity", "Consistency"],
      targets: ["all or nothing", "stays the same"],
      template: null,
    });
  });

  it("reads the items and columns of a bucket", () => {
    expect(parseOptions("bucket", { items: ["upper()", "now()"], columns: ["deterministic", "not"] })).toEqual({
      items: ["upper()", "now()"],
      targets: ["deterministic", "not"],
      template: null,
    });
  });

  it("reads the tokens and pre-fill mask of an assemble", () => {
    expect(parseOptions("assemble", { tokens: ["SELECT", "name"], fixed: [true, false] })).toEqual({
      items: ["SELECT", "name"],
      targets: null,
      template: [true, false],
    });
  });

  it("treats flat tokens as an empty assemble template", () => {
    expect(parseOptions("assemble", ["SELECT", "name"])).toEqual({
      items: ["SELECT", "name"],
      targets: null,
      template: [false, false],
    });
  });

  it("treats a token object without a mask as an empty template", () => {
    expect(parseOptions("assemble", { tokens: ["SELECT", "name"] })).toEqual({
      items: ["SELECT", "name"],
      targets: null,
      template: [false, false],
    });
  });

  it("falls back to a flat list when a match or bucket value is not two-sided", () => {
    expect(parseOptions("match", ["Atomicity"])).toEqual({ items: ["Atomicity"], targets: null, template: null });
  });

  it("drops non-string entries and handles null", () => {
    expect(parseOptions("pick_one", ["A", 1, "B", null])).toEqual({ items: ["A", "B"], targets: null, template: null });
    expect(parseOptions(null, null)).toEqual({ items: [], targets: null, template: null });
  });
});
