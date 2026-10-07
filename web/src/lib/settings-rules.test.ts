import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  MaintenanceInput,
  mergeSettings,
  SETTING_KEYS,
  SettingsInput,
  settingRows,
  shouldAutoApprove,
} from "./settings-rules";

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

  it("rejects a per-person cap that is zero or absurd", () => {
    expect(SettingsInput.safeParse({ ...ok, aiUserDailyCapUsd: 0 }).success).toBe(false);
    expect(SettingsInput.safeParse({ ...ok, aiUserDailyCapUsd: 101 }).success).toBe(false);
  });

  it("rejects a lifetime cap below the monthly cap", () => {
    expect(SettingsInput.safeParse({ ...ok, aiMonthlyCapUsd: 30, aiLifetimeCapUsd: 20 }).success).toBe(false);
    expect(SettingsInput.safeParse({ ...ok, aiLifetimeCapUsd: 0 }).success).toBe(false);
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

describe("launchDate", () => {
  const valid = {
    autoApprove: false,
    aiDailyCapUsd: 3,
    aiMonthlyCapUsd: 30,
    aiUserDailyCapUsd: 0.25,
    aiLifetimeCapUsd: 105,
    aiHardStop: true,
    aiPaused: false,
    maintenance: false,
    maintenanceMessage: "",
  };

  it("defaults to no launch date", () => {
    expect(DEFAULT_SETTINGS.launchDate).toBeNull();
    expect(mergeSettings([]).launchDate).toBeNull();
  });

  it("reads a stored date", () => {
    expect(mergeSettings([{ key: SETTING_KEYS.launchDate, value: "2026-10-12" }]).launchDate).toBe("2026-10-12");
  });

  it("reads the stored empty string as no date", () => {
    expect(mergeSettings([{ key: SETTING_KEYS.launchDate, value: "" }]).launchDate).toBeNull();
  });

  it("treats a malformed or impossible stored date as no date", () => {
    for (const value of ["soon", "2026-13-40", "2026-02-30", 5, null]) {
      expect(mergeSettings([{ key: SETTING_KEYS.launchDate, value }]).launchDate).toBeNull();
    }
  });

  it("stores no date as an empty string, because the column is jsonb not null", () => {
    const rows = settingRows({ ...DEFAULT_SETTINGS, launchDate: null });
    expect(rows).toContainEqual({ key: "launch_date", value: "" });
    expect(rows).toHaveLength(Object.keys(SETTING_KEYS).length);
    expect(settingRows({ ...DEFAULT_SETTINGS, launchDate: "2026-10-12" })).toContainEqual({ key: "launch_date", value: "2026-10-12" });
  });

  it("round-trips through the stored rows", () => {
    const saved = { ...DEFAULT_SETTINGS, launchDate: "2026-10-12" };
    expect(mergeSettings(settingRows(saved))).toEqual(saved);
    expect(mergeSettings(settingRows(DEFAULT_SETTINGS))).toEqual(DEFAULT_SETTINGS);
  });

  it("the form accepts a date, null and the empty string, and rejects a bad date", () => {
    expect(SettingsInput.safeParse({ ...valid, launchDate: "2026-10-12" }).success).toBe(true);
    expect(SettingsInput.safeParse({ ...valid, launchDate: null }).success).toBe(true);
    const empty = SettingsInput.safeParse({ ...valid, launchDate: "" });
    expect(empty.success && empty.data.launchDate).toBeNull();
    expect(SettingsInput.safeParse({ ...valid, launchDate: "2026-02-30" }).success).toBe(false);
    expect(SettingsInput.safeParse({ ...valid, launchDate: "12/10/2026" }).success).toBe(false);
  });
});

describe("maintenance", () => {
  it("defaults to live with no message", () => {
    expect(DEFAULT_SETTINGS.maintenance).toBe(false);
    expect(DEFAULT_SETTINGS.maintenanceMessage).toBe("");
  });

  it("round-trips the switch and the message through the stored rows", () => {
    const saved = { ...DEFAULT_SETTINGS, maintenance: true, maintenanceMessage: "Back by 6pm IST" };
    expect(settingRows(saved)).toContainEqual({ key: "maintenance", value: true });
    expect(settingRows(saved)).toContainEqual({ key: "maintenance_message", value: "Back by 6pm IST" });
    expect(mergeSettings(settingRows(saved))).toEqual(saved);
  });

  it("reads a malformed stored switch as live", () => {
    for (const value of ["true", 1, null]) expect(mergeSettings([{ key: SETTING_KEYS.maintenance, value }]).maintenance).toBe(false);
  });

  it("the maintenance form folds the message onto one line and accepts up to 140 characters", () => {
    const parsed = MaintenanceInput.safeParse({ maintenance: true, maintenanceMessage: "  Back\n by  6pm " });
    expect(parsed.success && parsed.data.maintenanceMessage).toBe("Back by 6pm");
    expect(MaintenanceInput.safeParse({ maintenance: false, maintenanceMessage: "x".repeat(140) }).success).toBe(true);
    const long = MaintenanceInput.safeParse({ maintenance: false, maintenanceMessage: "x".repeat(141) });
    expect(long.success).toBe(false);
    expect(long.error?.issues[0]?.message).toBe("Keep the maintenance message to 140 characters.");
  });

  it("the general form never carries the switch, so saving other settings cannot touch it", () => {
    const parsed = SettingsInput.safeParse({ ...DEFAULT_SETTINGS, maintenance: true, maintenanceMessage: "x" });
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty("maintenance");
    expect(parsed.data).not.toHaveProperty("maintenanceMessage");
    const keys = settingRows(parsed.data!).map((r) => r.key);
    expect(keys).not.toContain("maintenance");
    expect(keys).not.toContain("maintenance_message");
    expect(keys).toContain("ai_daily_cap_usd");
  });

  it("writes only the rows for the settings given", () => {
    expect(settingRows({ maintenance: true, maintenanceMessage: "" })).toEqual([
      { key: "maintenance", value: true },
      { key: "maintenance_message", value: "" },
    ]);
  });
});
