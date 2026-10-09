import { beforeEach, describe, expect, it, vi } from "vitest";

const saveUsername = vi.fn(async (): Promise<boolean> => true);
const dropUsername = vi.fn(async () => undefined);
const syncUser = vi.fn(async (): Promise<unknown> => ({ status: "ok", created: [], notInLibrary: 0 }));
let enabled = true;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ checkins: {} }));
vi.mock("@/lib/auth/viewer", () => ({ requireViewer: async () => ({ id: "u1" }) }));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
const latestSynced = vi.fn(async (): Promise<unknown> => null);
vi.mock("@/lib/activity/queries", () => ({ latestSynced }));
vi.mock("@/lib/tracker/service", () => ({ amendSyncedCheckin: vi.fn() }));
vi.mock("@/lib/upstash/keys", () => ({ key: vi.fn() }));
vi.mock("@/lib/upstash/redis", () => ({ redis: vi.fn() }));
vi.mock("@/lib/activity/service", () => ({ syncEnabled: () => enabled, syncUser, saveUsername, dropUsername }));

const { connectLeetCode } = await import("./sync");

describe("connectLeetCode", () => {
  beforeEach(() => {
    enabled = true;
    vi.clearAllMocks();
  });

  it("saves the username, then syncs", async () => {
    expect(await connectLeetCode(" https://leetcode.com/u/am4nn/ ")).toEqual({
      ok: true,
      result: { status: "ok", created: [], notInLibrary: 0 },
    });
    expect(saveUsername).toHaveBeenCalledWith("u1", "am4nn");
    expect(syncUser).toHaveBeenCalledWith("u1");
    expect(dropUsername).not.toHaveBeenCalled();
  });

  it("takes the username back when LeetCode doesn't know it", async () => {
    syncUser.mockResolvedValueOnce({ status: "unknown_user" });
    expect(await connectLeetCode("nobody-here")).toEqual({ error: "LeetCode has no user named nobody-here." });
    expect(dropUsername).toHaveBeenCalledWith("u1", "nobody-here");
  });

  it("keeps the username when LeetCode is only down", async () => {
    syncUser.mockResolvedValueOnce({ status: "failed", error: "timeout", unavailable: false });
    expect(await connectLeetCode("am4nn")).toMatchObject({ ok: true, result: { status: "failed" } });
    expect(dropUsername).not.toHaveBeenCalled();
  });

  it("never replaces a username that is already set", async () => {
    saveUsername.mockResolvedValueOnce(false);
    expect(await connectLeetCode("someone-else")).toEqual({ error: "You already have a LeetCode username." });
    expect(syncUser).not.toHaveBeenCalled();
  });

  it("refuses what can't be a username without touching the profile", async () => {
    expect(await connectLeetCode("two words")).toEqual({ error: "Enter your LeetCode username, like am4nn." });
    expect(saveUsername).not.toHaveBeenCalled();
  });

  it("from a problem page, reports that problem from the same sync", async () => {
    latestSynced.mockResolvedValueOnce({
      checkinId: "c1",
      result: "solved",
      attempts: 2,
      minutes: null,
      minutesSuggested: 25,
      at: "2026-10-09T10:00:00Z",
    });
    expect(await connectLeetCode("am4nn", "two-sum")).toEqual({
      ok: true,
      result: { status: "ok", created: [], notInLibrary: 0 },
      found: { checkinId: "c1", result: "solved", attempts: 2, minutes: 25, at: "2026-10-09T10:00:00Z" },
    });
    expect(syncUser).toHaveBeenCalledTimes(1);
    expect(latestSynced).toHaveBeenCalledWith("u1", "two-sum");
  });

  it("does nothing while sync is off", async () => {
    enabled = false;
    expect(await connectLeetCode("am4nn")).toEqual({ error: "LeetCode sync is off." });
    expect(saveUsername).not.toHaveBeenCalled();
  });
});
