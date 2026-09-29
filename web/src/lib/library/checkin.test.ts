import { describe, expect, it } from "vitest";
import { nearestTimeChip, parseCheckin } from "./checkin";

const f = (o: Record<string, string>) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(o)) d.set(k, v);
  return d;
};

describe("parseCheckin", () => {
  it("accepts a result with optional time and note", () => {
    const r = parseCheckin(f({ problemSlug: "two-sum", result: "hints", minutes: "30", note: "  used a map " }));
    expect(r.success && r.data).toEqual({ problemSlug: "two-sum", result: "hints", minutes: 30, note: "used a map" });
  });
  it("allows skipping time and note", () => {
    const r = parseCheckin(f({ problemSlug: "two-sum", result: "solved", minutes: "", note: "" }));
    expect(r.success && r.data).toEqual({ problemSlug: "two-sum", result: "solved", minutes: null, note: null });
  });
  it("rejects unknown results and silly times", () => {
    expect(parseCheckin(f({ problemSlug: "x", result: "maybe" })).success).toBe(false);
    expect(parseCheckin(f({ problemSlug: "x", result: "solved", minutes: "900" })).success).toBe(false);
  });
});

describe("nearestTimeChip", () => {
  it("returns null when sync suggested no time", () => {
    expect(nearestTimeChip(null)).toBeNull();
  });
  it("rounds down to the closest chip", () => {
    expect(nearestTimeChip(18)).toBe(15);
  });
  it("rounds up to the closest chip", () => {
    expect(nearestTimeChip(38)).toBe(45);
  });
  it("keeps a time that is already a chip", () => {
    expect(nearestTimeChip(60)).toBe(60);
  });
  it("clamps the sync cap of 120 to the largest chip", () => {
    expect(nearestTimeChip(120)).toBe(60);
  });
});
