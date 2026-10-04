import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings, SETTING_KEYS, SettingsInput, shouldAutoApprove } from "./settings-rules";

describe("mergeSettings", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(mergeSettings([])).toEqual(DEFAULT_SETTINGS);
  });

  it("applies stored values over the defaults", () => {
    const merged = mergeSettings([
      { key: SETTING_KEYS.autoApprove, value: true },
      { key: SETTING_KEYS.aiDailyCapUsd, value: 5 },
    ]);
    expect(merged).toEqual({ ...DEFAULT_SETTINGS, autoApprove: true, aiDailyCapUsd: 5 });
  });

  it("keeps the default for a malformed value rather than trusting it", () => {
    const merged = mergeSettings([
      { key: SETTING_KEYS.aiHardStop, value: "no" },
      { key: SETTING_KEYS.aiMonthlyCapUsd, value: -4 },
      { key: SETTING_KEYS.aiPaused, value: null },
    ]);
    expect(merged).toEqual(DEFAULT_SETTINGS);
  });

  it("ignores keys it does not know", () => {
    expect(mergeSettings([{ key: "something_else", value: true }])).toEqual(DEFAULT_SETTINGS);
  });
});

describe("SettingsInput", () => {
  const ok = { ...DEFAULT_SETTINGS };

  it("accepts the defaults", () => {
    expect(SettingsInput.safeParse(ok).success).toBe(true);
  });

  it.each([0, -1, 1001, Number.NaN])("rejects a cap of %s", (n) => {
    expect(SettingsInput.safeParse({ ...ok, aiDailyCapUsd: n }).success).toBe(false);
  });

  it("rejects a monthly cap below the daily cap", () => {
    const parsed = SettingsInput.safeParse({ ...ok, aiDailyCapUsd: 10, aiMonthlyCapUsd: 5 });
    expect(parsed.success).toBe(false);
  });
});

describe("shouldAutoApprove", () => {
  it("approves only a pending request, and only when the switch is on", () => {
    expect(shouldAutoApprove(true, "pending")).toBe(true);
    expect(shouldAutoApprove(false, "pending")).toBe(false);
  });

  it("never touches an approved, rejected or missing account", () => {
    expect(shouldAutoApprove(true, "approved")).toBe(false);
    expect(shouldAutoApprove(true, "rejected")).toBe(false);
    expect(shouldAutoApprove(true, null)).toBe(false);
    expect(shouldAutoApprove(true, undefined)).toBe(false);
  });
});
