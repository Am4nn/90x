import { MockLanguageModelV3 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

// addTurn with the model, the gate and the database layer stubbed: the failure path (a refused, failed or
// junk answer is a plain error, the user's message stays saved, no proposal) plus the model call's shape
// (the last step must answer, a refine sees what was proposed, only the last 6 messages are sent).

type Result = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;
const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};
const done = (content: unknown[], unified: "stop" | "tool-calls"): Result => ({
  content: content as Result["content"],
  finishReason: { unified, raw: undefined },
  usage,
  warnings: [],
});
const text = (t: string) => done([{ type: "text", text: t }], "stop");
const toolCall = () => done([{ type: "tool-call", toolCallId: `c${Math.random()}`, toolName: "find_topics", input: "{}" }], "tool-calls");
const answer = (say: string, picks: unknown[] = []) => text(JSON.stringify({ say, picks }));

const saveMessage = vi.fn<typeof import("./threads").saveMessage>(async () => undefined);
const trackCoachUsage = vi.fn<typeof import("./model").trackCoachUsage>(async () => undefined);
const trackFailedUsage = vi.fn<typeof import("@/lib/ai/failed-usage").trackFailedUsage>(async () => undefined);
const threadMessages = vi.fn<typeof import("./threads").threadMessages>(async () => []);
const aiGate = vi.fn<typeof import("@/lib/ai/guard").aiGate>(async () => ({ allowed: true }) as never);
const takeMessageSlot = vi.fn<typeof import("./rate-limit").takeMessageSlot>(async () => ({ allowed: true, retryAfterSec: 0 }));

const profileRows = [{ hasPremium: false, level: null, focus: null }];
const chain = () => ({
  from: () => ({
    where: () =>
      Object.assign(Promise.resolve(profileRows), { limit: async () => profileRows, orderBy: () => ({ limit: async () => [] }) }),
  }),
});
const tx = {};
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: chain, transaction: async (fn: (t: object) => unknown) => fn(tx) } }));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));
vi.mock("@/lib/ai", () => ({ fastModel: vi.fn(), NO_THINKING: {} }));
vi.mock("@/lib/ai/failed-usage", () => ({ trackFailedUsage }));
vi.mock("@/lib/ai/guard", () => ({ aiGate, refusal: () => "AI is resting for now." }));
vi.mock("@/lib/tracker/service", () => ({
  TOPIC_AREAS: ["system_design", "cs", "java", "sql"],
  ensureToday: async () => ({ state: "active", today: "2026-10-10", missions: [], extras: [], campaign: { companyFocus: null } }),
}));
vi.mock("./rate-limit", () => ({ takeMessageSlot }));
vi.mock("./model", () => ({ trackCoachUsage }));
vi.mock("./memory", () => ({ memoryForPrompt: async () => "" }));
vi.mock("./tools-data", () => ({
  findProblemsData: vi.fn(),
  findTopicsData: async () => ({ topics: [] }),
  weakSpotsData: async () => ({ patterns: [] }),
}));
vi.mock("./threads", () => ({
  extractThread: vi.fn(),
  findOrCreateDayThread: async () => ({ id: "t1", kind: "add", created: false }),
  findThread: vi.fn(),
  lockAdd: vi.fn(),
  previousAddThread: vi.fn(),
  saveMessage,
  threadMessages,
}));

const { addTurn } = await import("./add");

const userMsg = (id: string, t: string) => ({ id, role: "user" as const, parts: [{ type: "text", text: t }] });
const savedRoles = () => saveMessage.mock.calls.map((c) => (c[2] as { role: string }).role);

describe("addTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiGate.mockResolvedValue({ allowed: true } as never);
    takeMessageSlot.mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    threadMessages.mockResolvedValue([userMsg("m1", "something")]);
  });

  it("answers with no proposal when the model picks nothing, saving both messages and tracking usage once", async () => {
    const model = new MockLanguageModelV3({ doGenerate: answer("Nothing fits that, sorry.") });
    const result = await addTurn("u1", "something odd", { model });
    expect(result).toMatchObject({ ok: true, message: { role: "assistant", text: "Nothing fits that, sorry.", proposal: null } });
    expect(savedRoles()).toEqual(["user", "assistant"]);
    expect(trackCoachUsage).toHaveBeenCalledTimes(1);
    expect(trackCoachUsage.mock.calls[0]?.[1]).toBe("coach.add");
  });

  it("cuts a long answer to the stored limits instead of failing the turn", async () => {
    const model = new MockLanguageModelV3({ doGenerate: answer("s".repeat(500)) });
    const result = await addTurn("u1", "x", { model });
    expect(result).toMatchObject({ ok: true });
    if ("ok" in result) expect(result.message.text.length).toBeLessThanOrEqual(300);
  });

  it("returns a plain error for junk output, keeps the user's message, saves no answer", async () => {
    const model = new MockLanguageModelV3({ doGenerate: text("not json at all") });
    expect(await addTurn("u1", "x", { model })).toEqual({ error: "Coach couldn't answer that. Try again." });
    expect(savedRoles()).toEqual(["user"]);
    // generateText itself throws on output it cannot parse, so nothing reaches trackCoachUsage for such a turn;
    // the tokens the failed answer cost are metered from the error instead.
    expect(trackCoachUsage).not.toHaveBeenCalled();
    expect(trackFailedUsage).toHaveBeenCalledTimes(1);
    expect(trackFailedUsage.mock.calls[0]?.[0]).toBe("u1");
    expect(trackFailedUsage.mock.calls[0]?.[1]).toBe("coach.add");
  });

  it("returns the same plain error when the model call throws", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new Error("provider down");
      },
    });
    expect(await addTurn("u1", "x", { model })).toEqual({ error: "Coach couldn't answer that. Try again." });
    expect(savedRoles()).toEqual(["user"]);
  });

  it("refuses with the gate's message before saving or calling anything", async () => {
    aiGate.mockResolvedValue({ allowed: false, reason: "user-cap" } as never);
    const model = new MockLanguageModelV3({ doGenerate: answer("x") });
    expect(await addTurn("u1", "x", { model })).toEqual({ error: "AI is resting for now." });
    expect(saveMessage).not.toHaveBeenCalled();
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("asks the user to wait when the message slot is refused", async () => {
    takeMessageSlot.mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const model = new MockLanguageModelV3({ doGenerate: answer("x") });
    expect(await addTurn("u1", "x", { model })).toEqual({ error: "Give Coach a minute, then try again." });
    expect(saveMessage).not.toHaveBeenCalled();
  });

  it("sends only the last 6 messages", async () => {
    threadMessages.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({
        id: `m${i}`,
        role: (i % 2 ? "assistant" : "user") as "user" | "assistant",
        parts: [{ type: "text", text: `msg ${i}` }],
      })),
    );
    const model = new MockLanguageModelV3({ doGenerate: answer("ok") });
    await addTurn("u1", "x", { model });
    const sent = model.doGenerateCalls[0]!.prompt.filter((m) => m.role !== "system");
    expect(sent).toHaveLength(6);
    expect(JSON.stringify(sent[0])).toContain("msg 2");
  });

  it("tells the model what an earlier answer proposed, so a refine can change it", async () => {
    const proposal = {
      type: "tool-add_extras",
      toolCallId: "tc1",
      output: {
        status: "dismissed",
        proposal: {
          type: "add_extras",
          summary: "Add 1 to Extras",
          payload: {
            items: [
              {
                slotType: "new_problem",
                ref: "course-schedule",
                title: "Course Schedule",
                why: "w",
                estMinutes: 40,
                area: "dsa",
                meta: "Graphs · medium",
              },
            ],
          },
        },
      },
    };
    threadMessages.mockResolvedValue([
      userMsg("m1", "a graph problem"),
      { id: "m2", role: "assistant", parts: [{ type: "text", text: "One for you." }, proposal] },
      userMsg("m3", "Easier"),
    ]);
    const model = new MockLanguageModelV3({ doGenerate: answer("Swapped it.") });
    await addTurn("u1", "Easier", { model });
    expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).toContain("Proposed: Course Schedule (course-schedule)");
  });

  it("forces an answer on the last step: no tool choice allowed after two tool rounds", async () => {
    const model = new MockLanguageModelV3({ doGenerate: [toolCall(), toolCall(), answer("Done.")] });
    const result = await addTurn("u1", "x", { model });
    expect(result).toMatchObject({ ok: true, message: { text: "Done." } });
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(model.doGenerateCalls[0]!.toolChoice?.type).not.toBe("none");
    expect(model.doGenerateCalls[2]!.toolChoice).toEqual({ type: "none" });
  });
});
