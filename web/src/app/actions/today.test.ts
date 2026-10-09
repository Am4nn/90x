import { beforeEach, describe, expect, it, vi } from "vitest";

const markOpened = vi.fn<(userId: string, slug: string) => Promise<boolean>>(async () => true);
const removeExtra = vi.fn<(userId: string, id: string) => Promise<void>>(async () => undefined);
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/viewer", () => ({ requireViewer: async () => ({ id: "u1" }) }));
vi.mock("@/lib/tracker/service", () => ({
  addExtra: vi.fn(),
  markOpened,
  markStudied: vi.fn(),
  removeExtra,
  skipReview: vi.fn(),
  startRevive: vi.fn(),
  unmarkStudied: vi.fn(),
}));

const { markOpenedAction, removeExtraAction } = await import("./today");

describe("markOpenedAction", () => {
  beforeEach(() => {
    markOpened.mockClear();
    revalidatePath.mockClear();
  });

  it("revalidates Today and the Library on a first open", async () => {
    markOpened.mockResolvedValueOnce(true);
    expect(await markOpenedAction("dsa-arrays")).toEqual({ ok: true });
    expect(markOpened).toHaveBeenCalledWith("u1", "dsa-arrays");
    expect(revalidatePath.mock.calls.map((c) => c[0]).toSorted()).toEqual(["/library", "/today"]);
  });

  it("revalidates nothing on a re-open, so the lesson page is not re-rendered", async () => {
    markOpened.mockResolvedValueOnce(false);
    expect(await markOpenedAction("dsa-arrays")).toEqual({ ok: true });
    expect(markOpened).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses an odd slug without writing, and reports a failed write", async () => {
    expect(await markOpenedAction("../x")).toEqual({ error: "Unknown topic." });
    expect(markOpened).not.toHaveBeenCalled();
    markOpened.mockRejectedValueOnce(new Error("db down"));
    expect(await markOpenedAction("dsa-arrays")).toEqual({ error: "That didn't save. Try again." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("removeExtraAction", () => {
  beforeEach(() => {
    removeExtra.mockClear();
    revalidatePath.mockClear();
  });

  it("removes the viewer's extra and revalidates Today", async () => {
    const id = "0d3f5c1e-8a4b-4c6d-9e2f-1a2b3c4d5e6f";
    expect(await removeExtraAction(id)).toEqual({ ok: true });
    expect(removeExtra).toHaveBeenCalledWith("u1", id);
    expect(revalidatePath).toHaveBeenCalledWith("/today");
  });

  it("refuses an id that is not a uuid without touching the database", async () => {
    expect(await removeExtraAction("1 or 1=1")).toEqual({ error: "Unknown mission." });
    expect(removeExtra).not.toHaveBeenCalled();
  });
});
