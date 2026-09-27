import type { ToolSet } from "ai";

/** At most 5 tool calls per user message, whatever the mode. */
export const TOOL_CALLS_PER_MESSAGE = 5;

/**
 * Wraps a mode's tools so that one message can make at most `max` calls in
 * total. Parallel calls in one step count too, which a step limit alone
 * wouldn't catch. Over the limit, the model gets an error to answer around.
 */
export function limitToolCalls<T extends ToolSet>(tools: T, max = TOOL_CALLS_PER_MESSAGE): T {
  let calls = 0;
  const limited: ToolSet = {};
  for (const [name, tool] of Object.entries(tools)) {
    const execute = tool.execute;
    limited[name] = execute
      ? {
          ...tool,
          execute: (input: unknown, options: Parameters<typeof execute>[1]) =>
            ++calls > max
              ? { error: `Tool limit reached for this message (${max}). Answer with what you have.` }
              : execute(input as never, options),
        }
      : tool;
  }
  return limited as T;
}
