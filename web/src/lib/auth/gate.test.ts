import { describe, expect, it } from "vitest";
import { gate } from "./gate";

describe("gate", () => {
  it("sends signed-out visitors to the landing page", () => {
    expect(gate({ userId: null, approval: null, setupDone: false })).toBe("/");
  });
  it("keeps pending and rejected users on the waiting screen", () => {
    expect(gate({ userId: "u", approval: "pending", setupDone: false })).toBe("/pending");
    expect(gate({ userId: "u", approval: "rejected", setupDone: true })).toBe("/pending");
    expect(gate({ userId: "u", approval: null, setupDone: false })).toBe("/pending");
  });
  it("sends approved users without setup to setup", () => {
    expect(gate({ userId: "u", approval: "approved", setupDone: false })).toBe("/setup");
  });
  it("lets approved, set-up users in", () => {
    expect(gate({ userId: "u", approval: "approved", setupDone: true })).toBeNull();
  });
});
