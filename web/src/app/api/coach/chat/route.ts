import { randomUUID } from "node:crypto";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  readUIMessageStream,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { aiGate, refusal } from "@/lib/ai/guard";
import { gate } from "@/lib/auth/gate";
import { getViewer } from "@/lib/auth/viewer";
import { citationsOf, COACH_KINDS, threadTitle } from "@/lib/coach/chat-rules";
import { memoryForPrompt } from "@/lib/coach/memory";
import "@/lib/coach/modes";
import { type ModeContext, modeFor } from "@/lib/coach/mode";
import { coachModel, trackCoachUsage } from "@/lib/coach/model";
import { takeMessageSlot } from "@/lib/coach/rate-limit";
import { stopSignal } from "@/lib/coach/stop";
import { ensureThread, saveMessage, threadMessages } from "@/lib/coach/threads";
import { limitToolCalls, TOOL_CALLS_PER_MESSAGE } from "@/lib/coach/tool-limit";

// The coach chat. One POST per user message: the client sends
// only the new message; history comes from coach_messages, so a client can't
// rewrite what the coach said or fake a tool result.

// DeepSeek Pro thinks before each step, so a few tool calls plus the answer can
// run past a minute. At 60s the function was killed mid-tool and the thread was
// left with no answer.
export const maxDuration = 300;

const HISTORY = 30;
const MAX_MESSAGE_CHARS = 8000;
const BUSY = "Coach couldn't answer just now. Try again.";

const Body = z.object({
  threadId: z.uuid().optional(),
  kind: z.enum(COACH_KINDS).optional(),
  ref: z.string().trim().min(1).max(200).optional(),
  message: z.object({
    parts: z
      .array(z.object({ type: z.string(), text: z.string().optional() }))
      .min(1)
      .max(20),
  }),
});

const plain = (text: string, status: number) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function POST(request: Request) {
  // Taken before anything is awaited. A stop is honoured when it was asked for
  // after the run began, and the run begins here: reading it later meant a Stop
  // pressed while the thread, history and model were loading looked older than
  // the run and was ignored, which is exactly when a reader is most likely to
  // press it.
  const startedAt = Date.now();
  const viewer = await getViewer();
  if (!viewer || gate({ userId: viewer.id, approval: viewer.approval, setupDone: viewer.setupDone })) {
    return plain("Sign in to talk to Coach.", 401);
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return plain("That message didn't arrive in one piece. Try again.", 400);
  }
  const body = Body.safeParse(json);
  if (!body.success) return plain("That message didn't arrive in one piece. Try again.", 400);
  const text = body.data.message.parts
    .flatMap((p) => (p.type === "text" && p.text ? [p.text] : []))
    .join("\n")
    .trim();
  if (!text) return plain("Type a message first.", 400);
  if (text.length > MAX_MESSAGE_CHARS) return plain(`Keep it under ${MAX_MESSAGE_CHARS} characters.`, 400);

  const spend = await aiGate(viewer.id);
  if (!spend.allowed) return plain(refusal(spend), 503);

  const slot = await takeMessageSlot(viewer.id);
  if (!slot.allowed) {
    const minutes = Math.ceil(slot.retryAfterSec / 60);
    return plain(`That's a lot of messages in a short time. You can send more in ${minutes} minute${minutes === 1 ? "" : "s"}.`, 429);
  }

  // Declared out here so the catch can release it. Left inside the try it is not
  // in scope there, and `stop?.done()` silently resolved to lib.dom's global
  // `stop()` instead - which typechecks and releases nothing.
  let stop: { signal: AbortSignal; done: () => void } | undefined;
  try {
    const thread = await ensureThread(viewer.id, {
      id: body.data.threadId ?? randomUUID(),
      kind: body.data.kind ?? "chat",
      ref: body.data.ref ?? null,
      title: threadTitle(text),
    });
    if (!thread) return plain("That conversation isn't yours.", 404);
    const mode = modeFor(thread.kind);
    if (!mode) return plain("That kind of session isn't available yet.", 400);

    const history = await threadMessages(viewer.id, thread.id, HISTORY);
    const userMessage = { id: randomUUID(), role: "user" as const, parts: [{ type: "text" as const, text }] } satisfies UIMessage;
    await saveMessage(viewer.id, thread.id, userMessage);

    const ctx: ModeContext = {
      userId: viewer.id,
      threadId: thread.id,
      ref: thread.ref,
      memory: await memoryForPrompt(viewer.id),
      language: viewer.language,
      now: new Date(),
    };
    const tools = limitToolCalls(mode.tools?.(ctx) ?? {});
    const [instructions, { model }] = await Promise.all([mode.system(ctx), coachModel()]);

    const stored = [...history, userMessage] as UIMessage[];
    const valid = await safeValidateUIMessages({ messages: stored, tools });
    if (!valid.success) console.error("coach history didn't validate; answering from the new message only", valid.error);
    const messages = valid.success ? valid.data : [userMessage];
    const maxSteps = mode.maxSteps ?? TOOL_CALLS_PER_MESSAGE;

    /** Save the assistant's answer, once, whoever gets there first.
     *
     *  Two paths call this: the stream ending normally, before the response
     *  closes, and the background reader that covers a reader who left.
     *  `saveMessage` is idempotent by id, so the loser is a no-op. Doing it on
     *  the stream's end as well is what stops the client refreshing a thread
     *  that does not have the reply in it yet. */
    const store = async (message: UIMessage | undefined) => {
      // step-start parts stay: they split the answer into steps when the history is sent back.
      const parts = message?.parts ?? [];
      if (!parts.some((p) => p.type !== "step-start")) return;
      try {
        await saveMessage(viewer.id, thread.id, {
          id: z.uuid().safeParse(message?.id).success ? message!.id : randomUUID(),
          role: "assistant",
          parts,
          citations: citationsOf(parts),
        });
      } catch (e) {
        console.error("coach answer not saved", e);
      }
    };

    // Started here rather than earlier: anything above this that throws returns
    // before `done()` could run, and the interval would keep polling Redis every
    // 1.5 seconds after the request was over. The catch below releases it for the
    // same reason.
    stop = stopSignal(viewer.id, thread.id, startedAt);
    // A local binding as well, because the closures below run later and cannot
    // narrow the outer `let`.
    const stopping = stop;
    const stream = createUIMessageStream({
      originalMessages: messages,
      generateId: randomUUID,
      execute: async ({ writer }) => {
        const result = streamText({
          model,
          instructions,
          messages: await convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
          tools,
          stopWhen: stepCountIs(maxSteps),
          // The last step must answer, so a thread never ends on a bare tool call.
          prepareStep: ({ stepNumber }) => (stepNumber >= maxSteps - 1 ? { toolChoice: "none" } : undefined),
          // Not `request.signal`: tying generation to the connection meant
          // closing the app mid-answer killed the run before it could be saved,
          // so the work was paid for and thrown away. This aborts on an explicit
          // Stop instead, which is the only one of the two that means "I do not
          // want this". `maxDuration` bounds the rest.
          abortSignal: stopping.signal,
          onEnd: (end) => trackCoachUsage(viewer.id, `coach.${thread.kind}`, model, end),
        });
        writer.merge(
          toUIMessageStream({
            stream: result.stream,
            sendReasoning: false,
            onError: (e) => {
              console.error("coach stream failed", e);
              return BUSY;
            },
          }),
        );
      },
      onError: (e) => {
        console.error("coach chat failed", e);
        return BUSY;
      },
      // Awaited, so the stream does not report completion before the answer is in
      // the thread. Without it the client refreshes on the last chunk and can
      // read a thread that has no reply in it - or send its next message with the
      // previous answer missing from the history.
      onEnd: ({ responseMessage }) => store(responseMessage),
    });

    // Two things must be true for a reader to get their answer after closing the
    // app: the model has to keep going, and something has to keep reading it.
    // Not aborting on the connection handles the first; splitting the stream
    // handles the second. The response takes one branch, and the other is read
    // to the end on the server, which assembles the message to save and keeps
    // the source advancing when nobody is listening to the first.
    const [toClient, toStore] = stream.tee();
    void (async () => {
      let latest: UIMessage | undefined;
      try {
        for await (const message of readUIMessageStream({
          stream: toStore,
          onError: (e) => console.error("coach stream failed while saving", e),
        })) {
          latest = message;
        }
      } catch (e) {
        console.error("coach answer could not be assembled", e);
      } finally {
        // Or the poll outlives the reply it was watching.
        stopping.done();
      }
      await store(latest);
    })();

    return createUIMessageStreamResponse({ stream: toClient });
  } catch (e) {
    console.error("coach chat setup failed", e);
    stop?.done();
    return plain(BUSY, 500);
  }
}
