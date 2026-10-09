import { beforeEach, describe, expect, it, vi } from "vitest";

const checkUsername = vi.fn(async (): Promise<"ok" | "unknown" | "unreachable"> => "ok");
const replaceUsername = vi.fn(async () => undefined);
const syncUser = vi.fn(async (): Promise<unknown> => ({ status: "ok", created: [], notInLibrary: 0 }));
const leetcodeUsername = vi.fn(async (): Promise<string | null> => "old-name");
let enabled = true;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ checkins: {} }));
vi.mock("@/lib/auth/viewer", () => ({ requireViewer: async () => ({ id: "u1" }) }));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/activity/queries", () => ({ latestSynced: vi.fn(), leetcodeUsername }));
vi.mock("@/lib/tracker/service", () => ({ amendSyncedCheckin: vi.fn() }));
vi.mock("@/lib/upstash/keys", () => ({ key: vi.fn() }));
vi.mock("@/lib/upstash/redis", () => ({ redis: vi.fn() }));
vi.mock("@/lib/activity/service", () => ({
  syncEnabled: () => enabled,
  syncUser,
  checkUsername,
  replaceUsername,
  saveUsername: vi.fn(),
  dropUsername: vi.fn(),
}));

const { changeLeetCode, removeLeetCode } = await import("./sync");

describe("changeLeetCode", () => {
  beforeEach(() => {
    enabled = true;
    vi.clearAllMocks();
  });

  it("checks the new name with LeetCode, then switches to it and syncs", async () => {
    expect(await changeLeetCode("https://leetcode.com/u/new-name/")).toMatchObject({ ok: true, username: "new-name" });
    expect(checkUsername).toHaveBeenCalledWith("new-name");
    expect(replaceUsername).toHaveBeenCalledWith("u1", "new-name");
    expect(syncUser).toHaveBeenCalledWith("u1");
  });

  it("keeps the current name when LeetCode has no such user", async () => {
    checkUsername.mockResolvedValueOnce("unknown");
    expect(await changeLeetCode("typo-name")).toEqual({ error: "LeetCode has no user named typo-name." });
    expect(replaceUsername).not.toHaveBeenCalled();
  });

  it("keeps the current name when LeetCode can't be reached", async () => {
    checkUsername.mockResolvedValueOnce("unreachable");
    expect(await changeLeetCode("new-name")).toMatchObject({ error: expect.stringContaining("Couldn't reach LeetCode") });
    expect(replaceUsername).not.toHaveBeenCalled();
  });

  it("reports the change as saved when only the first sync throws", async () => {
    syncUser.mockRejectedValueOnce(new Error("db hiccup"));
    expect(await changeLeetCode("new-name")).toEqual({ ok: true, username: "new-name", result: undefined });
    expect(replaceUsername).toHaveBeenCalledWith("u1", "new-name");
  });

  it("does nothing when the name is unchanged", async () => {
    expect(await changeLeetCode("old-name")).toEqual({ ok: true, username: "old-name" });
    expect(checkUsername).not.toHaveBeenCalled();
    expect(replaceUsername).not.toHaveBeenCalled();
  });

  it("refuses what can't be a username, and does nothing while sync is off", async () => {
    expect(await changeLeetCode("two words")).toEqual({ error: "Enter your LeetCode username, like am4nn." });
    enabled = false;
    expect(await changeLeetCode("new-name")).toEqual({ error: "LeetCode sync is off." });
    expect(replaceUsername).not.toHaveBeenCalled();
  });
});

describe("removeLeetCode", () => {
  it("clears the username (and with it the sync status)", async () => {
    expect(await removeLeetCode()).toEqual({ ok: true, username: null });
    expect(replaceUsername).toHaveBeenCalledWith("u1", null);
  });
});
