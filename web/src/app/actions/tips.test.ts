import { beforeEach, describe, expect, it, vi } from "vitest";

const markTipsSeen = vi.fn(async (): Promise<void> => undefined);
const logError = vi.fn();
vi.mock("@/lib/auth/viewer", () => ({ requireViewer: async () => ({ id: "u1" }) }));
vi.mock("@/lib/log", () => ({ logError }));
vi.mock("@/lib/tracker/welcome-queries", () => ({ markTipsSeen }));

const { tipsSeenAction } = await import("./tips");

describe("tipsSeenAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks known step ids seen", async () => {
    await tipsSeenAction(["plan-me", "audio"]);
    expect(markTipsSeen).toHaveBeenCalledWith("u1", ["plan-me", "audio"]);
  });

  it("drops ids it doesn't know", async () => {
    await tipsSeenAction(["plan-me", "x", 5 as unknown as string]);
    expect(markTipsSeen).toHaveBeenCalledWith("u1", ["plan-me"]);
  });

  it("only logs when saving fails: the demo still closes", async () => {
    markTipsSeen.mockRejectedValueOnce(new Error("db down"));
    await expect(tipsSeenAction(["audio"])).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalled();
  });
});
