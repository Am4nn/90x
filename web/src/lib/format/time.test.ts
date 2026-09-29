import { afterEach, describe, expect, it, vi } from "vitest";
import { ago, relative } from "./time";

describe("ago", () => {
  afterEach(() => vi.useRealTimers());

  it("labels today, yesterday and older days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    expect(ago("2026-09-30T10:00:00Z")).toBe("today");
    expect(ago("2026-09-29T12:00:00Z")).toBe("yesterday");
    expect(ago("2026-09-28T12:00:00Z")).toBe("2 days ago");
  });
});

describe("relative", () => {
  afterEach(() => vi.useRealTimers());

  it("labels just now, minutes, hours and days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    expect(relative("2026-09-30T11:59:59Z")).toBe("just now");
    expect(relative("2026-09-30T11:57:00Z")).toBe("3m ago");
    expect(relative("2026-09-30T09:00:00Z")).toBe("3h ago");
    expect(relative("2026-09-28T12:00:00Z")).toBe("2d ago");
  });
});
