import { describe, expect, it } from "vitest";
import { parseSetup } from "./setup";

const form = (over: Record<string, string> = {}) => {
  const f = new FormData();
  const base = { name: "Aman", role: "backend", language: "java", timezone: "Asia/Kolkata", campaign_days: "90",
                 leetcode_username: "", has_leetcode_premium: "", weekday_minutes: "120", weekend_minutes: "180" };
  for (const [k, v] of Object.entries({ ...base, ...over })) f.set(k, v);
  return f;
};

describe("parseSetup", () => {
  it("accepts a complete form and normalizes optional fields", () => {
    const r = parseSetup(form({ leetcode_username: "  am4nn ", has_leetcode_premium: "on" }));
    expect(r.success && r.data).toMatchObject({
      name: "Aman", role: "backend", language: "java", campaign_days: 90,
      leetcode_username: "am4nn", has_leetcode_premium: true,
    });
  });
  it("treats an empty LeetCode username as none", () => {
    const r = parseSetup(form());
    expect(r.success && r.data.leetcode_username).toBeNull();
  });
  it("rejects unknown languages and out-of-range campaigns", () => {
    expect(parseSetup(form({ language: "cobol" })).success).toBe(false);
    expect(parseSetup(form({ campaign_days: "3" })).success).toBe(false);
    expect(parseSetup(form({ campaign_days: "400" })).success).toBe(false);
  });
  it("takes the daily time budget from the hour chips", () => {
    const r = parseSetup(form());
    expect(r.success && r.data).toMatchObject({ weekday_minutes: 120, weekend_minutes: 180 });
    expect(parseSetup(form({ weekday_minutes: "45" })).success).toBe(false);
    expect(parseSetup(form({ weekend_minutes: "" })).success).toBe(false);
  });
  it("rejects invalid timezones", () => {
    expect(parseSetup(form({ timezone: "Mars/Olympus" })).success).toBe(false);
  });
});
