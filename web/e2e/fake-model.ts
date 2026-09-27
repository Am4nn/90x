// A stand-in for the AI provider in the e2e job, the way serverless-redis-http
// stands in for Upstash: the app runs with AI_PROVIDER=openai-compatible and
// AI_BASE_URL pointing here, so no app code knows it's under test.
//
// Chat calls stream a fixed reply that quotes the user's last message, in a few
// chunks. JSON calls (solution review, memory extraction) get a fixed object
// picked by their system prompt. Every request is kept for GET /requests, so a
// spec can check which prompt reached the model.
//
//   bun run e2e/fake-model.ts   (port FAKE_MODEL_PORT, default 8078)

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { FAKE_REVIEW, fakeReply, type SeenRequest } from "./fake-model-data";

type Message = { role: string; content: string | { type: string; text?: string }[] | null };
type ChatRequest = { model: string; messages: Message[]; stream?: boolean; response_format?: { type: string } };

const port = Number(process.env.FAKE_MODEL_PORT ?? 8078);
const seen: SeenRequest[] = [];

const textOf = (content: Message["content"]) =>
  typeof content === "string" ? content : (content ?? []).map((p) => (p.type === "text" ? (p.text ?? "") : "")).join("");

/** The fixed object for a structured call, by what its system prompt asks for. */
function jsonFor(system: string): unknown {
  if (system.includes("reviewing one person's solution")) return FAKE_REVIEW;
  if (system.includes("long-term notes")) return { facts: [], seen: [] };
  return {};
}

const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 };

function chunk(model: string, delta: object, finish: string | null = null, withUsage = false) {
  const body = { id: "fake", object: "chat.completion.chunk", created: 0, model, choices: [{ index: 0, delta, finish_reason: finish }] };
  return `data: ${JSON.stringify(withUsage ? { ...body, usage } : body)}\n\n`;
}

/** Words in a few pieces with a pause between, so the page sees a real stream. */
async function stream(response: ServerResponse, model: string, text: string) {
  const words = text.split(/(?<= )/);
  const size = Math.ceil(words.length / 4);
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  response.write(chunk(model, { role: "assistant", content: "" }));
  for (let i = 0; i < words.length; i += size) {
    await sleep(150);
    response.write(chunk(model, { content: words.slice(i, i + size).join("") }));
  }
  response.write(chunk(model, {}, "stop", true));
  response.end("data: [DONE]\n\n");
}

function sendJson(response: ServerResponse, value: unknown) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage): Promise<ChatRequest> {
  let raw = "";
  for await (const part of request) raw += part;
  return JSON.parse(raw) as ChatRequest;
}

createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (request.method === "GET" && pathname === "/requests") return sendJson(response, seen);
  if (request.method !== "POST" || !pathname.endsWith("/chat/completions")) {
    response.writeHead(404).end("Not found");
    return;
  }

  const body = await readBody(request);
  const system = body.messages
    .filter((m) => m.role === "system")
    .map((m) => textOf(m.content))
    .join("\n");
  const user = textOf(body.messages.findLast((m) => m.role === "user")?.content ?? "");
  const json = body.response_format?.type === "json_object" || body.response_format?.type === "json_schema";
  seen.push({ model: body.model, system, user, json });

  const content = json ? JSON.stringify(jsonFor(system)) : fakeReply(user);
  if (body.stream) return stream(response, body.model, content);
  sendJson(response, {
    id: "fake",
    object: "chat.completion",
    created: 0,
    model: body.model,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage,
  });
}).listen(port, () => console.log(`fake model listening on http://localhost:${port}`));
