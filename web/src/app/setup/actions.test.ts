import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const redirect = vi.fn((to: string) => order.push(`redirect ${to}`));
const startCampaign = vi.fn(async () => {
  order.push("startCampaign");
});
const syncUser = vi.fn(async (): Promise<unknown> => {
  order.push("syncUser");
  return { status: "ok" };
});
const logError = vi.fn();
let username: string | null = "aman";

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/viewer", () => ({ requireViewer: async () => ({ id: "u1" }) }));
vi.mock("@/db", () => ({ db: { update: () => ({ set: () => ({ where: async () => undefined }) }) } }));
vi.mock("@/db/schema", () => ({ profiles: { userId: "user_id" } }));
vi.mock("@/lib/log", () => ({ logError }));
vi.mock("@/lib/tracker/campaign", () => ({ startCampaign }));
vi.mock("@/lib/activity/service", () => ({ syncUser }));
vi.mock("@/lib/setup", () => ({
  parseSetup: () => ({
    success: true,
    data: {
      name: "Aman",
      role: "backend",
      language: "python",
      level: "some_practice",
      timezone: "Asia/Kolkata",
      campaign_days: 90,
      leetcode_username: username,
      has_leetcode_premium: false,
      weekday_minutes: 120,
      weekend_minutes: 120,
    },
  }),
}));

const { saveSetup } = await import("./actions");

describe("saveSetup", () => {
  beforeEach(() => {
    order.length = 0;
    username = "aman";
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it("syncs LeetCode after starting the plan and before Today plans day 1", async () => {
    await saveSetup({}, new FormData());
    expect(order).toEqual(["startCampaign", "syncUser", "redirect /today"]);
    expect(syncUser).toHaveBeenCalledWith("u1");
  });

  it("does not sync without a LeetCode username", async () => {
    username = null;
    await saveSetup({}, new FormData());
    expect(syncUser).not.toHaveBeenCalled();
    expect(order).toEqual(["startCampaign", "redirect /today"]);
  });

  it("still goes to Today when the sync fails", async () => {
    syncUser.mockRejectedValueOnce(new Error("LeetCode is down"));
    await saveSetup({}, new FormData());
    expect(redirect).toHaveBeenCalledWith("/today");
    expect(logError).toHaveBeenCalledWith("setup: first LeetCode sync failed", expect.any(Error));
  });

  it("stops waiting for a slow sync after 8 seconds", async () => {
    vi.useFakeTimers();
    syncUser.mockImplementationOnce(() => new Promise(() => undefined));
    const done = saveSetup({}, new FormData());
    await vi.advanceTimersByTimeAsync(7_999);
    expect(redirect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(redirect).toHaveBeenCalledWith("/today");
  });
});
