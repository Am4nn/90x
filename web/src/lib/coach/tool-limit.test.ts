import type { ToolSet } from "ai";
import { describe, expect, it } from "vitest";
import { limitToolCalls, TOOL_CALLS_PER_MESSAGE } from "./tool-limit";

const options = { toolCallId: "t", messages: [] } as never;

describe("limitToolCalls", () => {
  it("runs calls up to the limit across all tools, then refuses", async () => {
    const tools = {
      a: { inputSchema: {} as never, execute: async () => "a" },
      b: { inputSchema: {} as never, execute: async () => "b" },
    } as unknown as ToolSet;
    const limited = limitToolCalls(tools, 3);
    const run = (name: "a" | "b") => limited[name]?.execute?.({}, options);
    expect(await run("a")).toBe("a");
    expect(await run("b")).toBe("b");
    expect(await run("a")).toBe("a");
    expect(await run("b")).toEqual({ error: expect.stringMatching(/limit/) });
  });

  it("leaves tools without execute alone and defaults to five calls", () => {
    const tools = { c: { inputSchema: {} as never } } as unknown as ToolSet;
    expect(limitToolCalls(tools).c).toBe(tools.c);
    expect(TOOL_CALLS_PER_MESSAGE).toBe(5);
  });
});
