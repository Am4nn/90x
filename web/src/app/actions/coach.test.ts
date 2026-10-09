import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveProposal = vi.fn<typeof import("@/lib/coach/act").resolveProposal>(async () => ({
  ok: true,
  status: "confirmed",
  note: "Added 1 to Extras.",
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/auth/viewer", () => ({ requireViewer: async () => ({ id: "u1" }) }));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/coach/act", () => ({ resolveProposal }));
vi.mock("@/lib/coach/memory-edit", () => ({ addFact: vi.fn(), deleteFact: vi.fn(), editFact: vi.fn() }));
vi.mock("@/lib/coach/threads", () => ({ extractThread: vi.fn(), getThread: vi.fn() }));

const { decideProposal } = await import("./coach");

const base = { threadId: "7a1c1b0e-1f2d-4c3b-9a8e-0f1e2d3c4b5a", toolCallId: "call-1", decision: "confirm" as const };

describe("decideProposal refs (Add with Coach)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes one to three ticked refs through", async () => {
    expect(await decideProposal({ ...base, refs: ["a", "b", "c"] })).toMatchObject({ ok: true });
    expect(resolveProposal).toHaveBeenCalledWith("u1", base.threadId, "call-1", "confirm", ["a", "b", "c"]);
  });

  it("works without refs, as every other proposal does", async () => {
    expect(await decideProposal(base)).toMatchObject({ ok: true });
    expect(resolveProposal).toHaveBeenCalledWith("u1", base.threadId, "call-1", "confirm", undefined);
  });

  it("refuses none and four, and an empty ref, before anything runs", async () => {
    for (const refs of [[], ["a", "b", "c", "d"], [""]]) {
      expect(await decideProposal({ ...base, refs })).toEqual({ error: "That suggestion can't be used." });
    }
    expect(resolveProposal).not.toHaveBeenCalled();
  });
});
