import { describe, expect, it } from "vitest";
import { optionsCount, parseOptions } from "./options";

describe("parseOptions", () => {
  it("reads a flat list for the list primitives", () => {
    expect(parseOptions("pick_one", ["A", "B", "C"])).toEqual({ shape: "list", items: ["A", "B", "C"] });
    expect(parseOptions("order", ["step 1", "step 2"])).toEqual({ shape: "list", items: ["step 1", "step 2"] });
    expect(parseOptions("tap_in_place", ["line 1", "line 2"])).toEqual({ shape: "list", items: ["line 1", "line 2"] });
    expect(parseOptions("claim_grid", ["a statement"])).toEqual({ shape: "list", items: ["a statement"] });
  });

  it("reads the left and right sides of a match", () => {
    expect(parseOptions("match", { left: ["Atomicity", "Consistency"], right: ["all or nothing", "stays the same"] })).toEqual({
      shape: "match",
      left: ["Atomicity", "Consistency"],
      right: ["all or nothing", "stays the same"],
    });
  });

  it("reads the items and columns of a bucket", () => {
    expect(parseOptions("bucket", { items: ["upper()", "now()"], columns: ["deterministic", "not"] })).toEqual({
      shape: "bucket",
      items: ["upper()", "now()"],
      columns: ["deterministic", "not"],
    });
  });

  it("reads the tokens and pre-fill slots of an assemble", () => {
    expect(parseOptions("assemble", { tokens: ["SELECT", "name", "FROM"], fixed: [0, null, null] })).toEqual({
      shape: "assemble",
      tokens: ["SELECT", "name", "FROM"],
      fixed: [0, null, null],
    });
  });

  it("a missing or malformed assemble mask means build the whole line", () => {
    expect(parseOptions("assemble", { tokens: ["SELECT", "name"] })).toEqual({
      shape: "assemble",
      tokens: ["SELECT", "name"],
      fixed: [null, null],
    });
    expect(parseOptions("assemble", { tokens: ["SELECT", "name"], fixed: [true, false] })).toEqual({
      shape: "assemble",
      tokens: ["SELECT", "name"],
      fixed: [null, null],
    });
  });

  it("reads the rows and columns of a grid toggle", () => {
    expect(parseOptions("grid_toggle", { rows: ["GET", "PUT"], columns: ["Safe", "Idempotent"] })).toEqual({
      shape: "grid",
      rows: ["GET", "PUT"],
      columns: ["Safe", "Idempotent"],
    });
  });

  it("returns null for the none primitives and for a legacy card", () => {
    expect(parseOptions("numeric", null)).toBeNull();
    expect(parseOptions(null, ["A", "B"])).toBeNull();
  });

  it("returns null when a shape's value is malformed or empty, and drops non-strings", () => {
    expect(parseOptions("match", ["Atomicity"])).toBeNull();
    expect(parseOptions("match", { left: ["A"], right: [] })).toBeNull();
    expect(parseOptions("grid_toggle", { rows: ["GET"] })).toBeNull();
    expect(parseOptions("pick_one", [])).toBeNull();
    expect(parseOptions("pick_one", ["A", 1, "B", null])).toEqual({ shape: "list", items: ["A", "B"] });
  });
});

describe("optionsCount", () => {
  it("counts the items of each shape", () => {
    expect(optionsCount({ shape: "list", items: ["a", "b"] })).toBe(2);
    expect(optionsCount({ shape: "match", left: ["a", "b"], right: ["x", "y"] })).toBe(2);
    expect(optionsCount({ shape: "bucket", items: ["a"], columns: ["x", "y"] })).toBe(1);
    expect(optionsCount({ shape: "assemble", tokens: ["a", "b", "c"], fixed: [null, null, null] })).toBe(3);
    expect(optionsCount({ shape: "grid", rows: ["r1"], columns: ["c1", "c2"] })).toBe(1);
    expect(optionsCount(null)).toBe(0);
  });
});
