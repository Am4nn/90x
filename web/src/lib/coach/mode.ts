import "server-only";
import type { ToolSet } from "ai";

// The one contract the coach's pieces share. A thread has a kind; each kind
// is a Mode: its own system prompt and tools. The chat route runs
// any mode; lessons and solution-review follow-ups and mock
// interviews each register a mode here instead of building their
// own chat. Keep this file small: modes live in their own files.

export type CoachKind = "chat" | "lesson" | "review" | "mock" | "add";

export type ModeContext = {
  userId: string;
  threadId: string;
  /** What the thread is about: a pattern slug (lesson), a solution review id (review), a mock id (mock), or null. */
  ref: string | null;
  /** The user's coach memory, ready for the prompt (lib/coach/memory.ts memoryForPrompt). */
  memory: string;
  /** DSA language from setup: java, python, cpp, javascript, or null. */
  language: string | null;
  now: Date;
};

export type Mode = {
  kind: CoachKind;
  /** System prompt for this thread. May read the database for context (scoped to ctx.userId). */
  system: (ctx: ModeContext) => Promise<string>;
  /** Tools the model may call in this thread. Read tools run freely; action tools must only PROPOSE. */
  tools?: (ctx: ModeContext) => ToolSet;
  /** Upper bound on tool-call steps per user message (at most 8). */
  maxSteps?: number;
};

const registry = new Map<CoachKind, Mode>();

/** @public Called by each mode file in lib/coach/modes/. */
export function registerMode(mode: Mode) {
  registry.set(mode.kind, mode);
}

/** @public Called by the chat route. */
export function modeFor(kind: CoachKind): Mode | undefined {
  return registry.get(kind);
}
