import { describe, expect, it } from "vitest";
import { applyCheckin, dismiss, postpone, type Review } from "./ladder";

const today = "2026-09-27";
const active = (step: 1 | 2 | 3, due = today): Review => ({ step, dueDate: due, status: "active" });

describe("applyCheckin", () => {
  it("a first-try solve never enters the ladder", () => {
    expect(applyCheckin(null, "solved", today)).toBeNull();
  });

  it("failed or with hints enters at step 1, due in 3 days", () => {
    expect(applyCheckin(null, "failed", today)).toEqual({ step: 1, dueDate: "2026-09-30", status: "active" });
    expect(applyCheckin(null, "hints", today)).toEqual({ step: 1, dueDate: "2026-09-30", status: "active" });
  });

  it("a clean solve climbs: step 1 → 7 days, step 2 → 21 days, step 3 → graduated", () => {
    expect(applyCheckin(active(1), "solved", today)).toEqual({ step: 2, dueDate: "2026-10-04", status: "active" });
    expect(applyCheckin(active(2), "solved", today)).toEqual({ step: 3, dueDate: "2026-10-18", status: "active" });
    expect(applyCheckin(active(3), "solved", today)).toEqual({ step: 3, dueDate: today, status: "graduated" });
  });

  it("struggling again resets to step 1", () => {
    expect(applyCheckin(active(3), "hints", today)).toEqual({ step: 1, dueDate: "2026-09-30", status: "active" });
  });

  it("a dismissed or graduated problem comes back only if you struggle again", () => {
    const gone: Review = { step: 2, dueDate: today, status: "dismissed" };
    expect(applyCheckin(gone, "solved", today)).toEqual(gone);
    expect(applyCheckin(gone, "failed", today)).toEqual({ step: 1, dueDate: "2026-09-30", status: "active" });
  });
});

describe("review mission actions", () => {
  it("Not today moves it to tomorrow at the same step", () => {
    expect(postpone(active(2), today)).toEqual({ step: 2, dueDate: "2026-09-28", status: "active" });
  });

  it("I've got this removes it", () => {
    expect(dismiss(active(1)).status).toBe("dismissed");
  });
});
