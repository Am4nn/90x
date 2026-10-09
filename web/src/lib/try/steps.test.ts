import { describe, expect, it } from "vitest";
import { bucketSeconds, furthestStep } from "./steps";

describe("bucketSeconds", () => {
  it("puts seconds in coarse buckets, edges going up", () => {
    expect(bucketSeconds(0)).toBe("0-10");
    expect(bucketSeconds(7)).toBe("0-10");
    expect(bucketSeconds(10)).toBe("10-30");
    expect(bucketSeconds(45)).toBe("30-60");
    expect(bucketSeconds(119.9)).toBe("60-120");
    expect(bucketSeconds(299)).toBe("120-300");
    expect(bucketSeconds(300)).toBe("300+");
    expect(bucketSeconds(999)).toBe("300+");
  });
});

describe("furthestStep", () => {
  it("is the furthest step reached, whatever the order", () => {
    expect(furthestStep(["view"])).toBe("viewed");
    expect(furthestStep(["view", "answer", "listen_start"])).toBe("listened");
    expect(furthestStep(["view", "signin_click"])).toBe("signed_in");
    expect(furthestStep(["listen_95", "answer", "tab", "leave"])).toBe("listened");
    expect(furthestStep([])).toBe("viewed");
  });
});
