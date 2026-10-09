import { NoObjectGeneratedError } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A model answer that fails the schema was still billed: the error carries the tokens.

const recordUsage = vi.fn<typeof import("./usage").recordUsage>(async () => 0);
const logError = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("./usage", () => ({ recordUsage }));
vi.mock("@/lib/log", () => ({ logError }));

const { trackFailedUsage } = await import("./failed-usage");

const usage = { inputTokens: 120, outputTokens: 30, totalTokens: 150, raw: undefined } as never;
const schemaError = (u: unknown = usage) => {
  const e = new NoObjectGeneratedError({
    message: "response did not match schema",
    response: {} as never,
    usage: u as never,
    finishReason: "stop",
  });
  return u === null ? Object.assign(e, { usage: undefined }) : e;
};

beforeEach(() => vi.clearAllMocks());

describe("trackFailedUsage", () => {
  it("records the tokens a schema failure carried, once, under the caller's route and model", async () => {
    await trackFailedUsage("u1", "coach.review", "deepseek-v4-flash", schemaError());
    expect(recordUsage).toHaveBeenCalledTimes(1);
    expect(recordUsage).toHaveBeenCalledWith({
      userId: "u1",
      route: "coach.review",
      model: "deepseek-v4-flash",
      tokensIn: 120,
      tokensOut: 30,
    });
  });

  it("takes the model name from a model object and allows no user", async () => {
    await trackFailedUsage(null, "feed.grade", { modelId: "m-x" } as never, schemaError());
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ userId: null, model: "m-x" }));
  });

  it("records nothing for other errors or a schema failure without usage", async () => {
    await trackFailedUsage("u1", "r", "m", new Error("network down"));
    await trackFailedUsage("u1", "r", "m", schemaError(null));
    await trackFailedUsage("u1", "r", "m", "boom");
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("never throws when recording fails", async () => {
    recordUsage.mockRejectedValueOnce(new Error("db down"));
    await expect(trackFailedUsage("u1", "r", "m", schemaError())).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalled();
  });
});
