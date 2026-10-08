import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const MINE = "11111111-1111-4111-8111-111111111111";
const mockView = vi.fn(async (userId: string, mockId: string) =>
  userId === "me" && mockId === MINE ? { id: MINE, status: "running" as string } : null,
);
vi.mock("../mocks", () => ({ mockView }));
vi.mock("../stories", () => ({ listStories: async () => [] }));

await import("./mock");
const { modeFor } = await import("../mode");

type EndResult = { proposal?: { payload: { mockId: string } }; error?: string };

async function endMock(userId: string, ref: string | null): Promise<EndResult> {
  const tools = modeFor("mock")?.tools?.({ userId, threadId: "t1", ref, memory: "", language: null, now: new Date() });
  const run = tools?.end_mock?.execute as (input: { reason: string }, options: unknown) => Promise<EndResult>;
  return run({ reason: "Time is up." }, { toolCallId: "c1", messages: [] });
}

describe("end_mock in a mock thread", () => {
  beforeEach(() => mockView.mockClear());

  it("proposes ending the viewer's own running mock", async () => {
    const out = await endMock("me", MINE);
    expect(out.proposal?.payload.mockId).toBe(MINE);
    expect(mockView).toHaveBeenCalledWith("me", MINE);
  });

  it("proposes nothing for a mock that is someone else's", async () => {
    const out = await endMock("someone-else", MINE);
    expect(out.proposal).toBeUndefined();
    expect(out.error).toBeTruthy();
  });

  it("proposes nothing for a ref that is not a mock id, or a mock already ended", async () => {
    expect((await endMock("me", "not-a-uuid")).proposal).toBeUndefined();
    expect(mockView).not.toHaveBeenCalled();
    mockView.mockResolvedValueOnce({ id: MINE, status: "scored" });
    expect((await endMock("me", MINE)).error).toMatch(/already ended/);
  });
});
