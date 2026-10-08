// Server error logging that never prints what a person wrote.
//
// `console.error(label, e)` prints the whole error object, and the errors this app meets carry
// people's data in them: Drizzle's DrizzleQueryError message is "Failed query: <sql>\nparams:
// <every bound value>" (a check-in note, an invitee's address, an answer), and the AI SDK's
// APICallError carries requestBodyValues and responseBody (the whole prompt). Vercel keeps
// those logs and anyone on the team, or any log drain, can read them. logError keeps what a
// failure is diagnosed by (error name, code, HTTP status, the first line of the message, the
// stack frames) and drops everything else.
//
// A message is printed only for error classes known to put no personal data in it
// (SAFE_MESSAGE_ERRORS). Any other class logs its name, code and a fixed line: an unknown
// error's message could say anything ("Invalid recipient: someone@example.com").

const MESSAGE_MAX = 300;
const STACK_FRAMES = 12;

type Summary = {
  name: string;
  message: string;
  code?: string | number;
  status?: number;
  stack?: string;
  cause?: Summary;
};

// AI SDK errors whose message quotes what the model produced, or what was sent to it:
// "Type validation failed: Value: {...}", "JSON parsing failed: Text: ...", "Invalid input for tool ...".
// Model output can quote a person's answer or code, so these log their class and a fixed line only.
const MODEL_CONTENT_ERRORS = new Set([
  "AI_TypeValidationError",
  "AI_JSONParseError",
  "AI_InvalidResponseDataError",
  "AI_InvalidToolInputError",
  "AI_InvalidStreamPartError",
  "AI_ToolCallRepairError",
  "AI_MessageConversionError",
  "AI_UIMessageStreamError",
  "AI_InvalidDataContentError",
  "AI_InvalidPromptError",
  "AI_InvalidMessageRoleError",
]);
const WITHHELD = "model content withheld";

// Error classes whose message names what went wrong and not whose data it was: SQL text with
// placeholders, Postgres and Redis error text, HTTP failures, engine errors about code, fixed
// AI SDK lines, and the app's own email error. Matched by name, which minified builds keep for
// all of them (Drizzle's and postgres.js's errors are recognised by shape, see errorName).
const SAFE_MESSAGE_ERRORS = new Set([
  "DrizzleQueryError",
  "PostgresError",
  "UpstashError",
  "AbortError",
  "TimeoutError",
  "TypeError",
  "ReferenceError",
  "AI_APICallError",
  "AI_NoObjectGeneratedError",
  "AI_NoContentGeneratedError",
  "AI_NoOutputGeneratedError",
  "AI_EmptyResponseBodyError",
  "AI_LoadAPIKeyError",
  "AI_NoSuchToolError",
  "AuthApiError",
  "AuthRetryableFetchError",
  "AuthSessionMissingError",
  "EmailSendError",
]);
const UNLISTED = "message withheld";

/** What may be said of an error's message: the cut first line for a safe class, a fixed line otherwise. */
export function messageFor(name: unknown, message: unknown): string {
  if (carriesModelContent(name)) return WITHHELD;
  if (typeof name !== "string" || !SAFE_MESSAGE_ERRORS.has(name)) return UNLISTED;
  return safeMessage(message);
}

/** True for an error class whose message carries model input or output. */
function carriesModelContent(name: unknown): boolean {
  return typeof name === "string" && MODEL_CONTENT_ERRORS.has(name);
}

// Where a message's payload starts: Drizzle's bound parameters, the AI SDK's quoted value or text.
export const PAYLOAD = /\n\s*params:|: (?:Value|Text): |Invalid response data: /i;

/** The first line of a message, cut before any bound parameters or quoted model content, and capped. */
export function safeMessage(message: unknown): string {
  const text = typeof message === "string" ? message : String(message);
  const head = text.split(PAYLOAD)[0]?.split("\n")[0] ?? "";
  return head.length > MESSAGE_MAX ? `${head.slice(0, MESSAGE_MAX)}…` : head;
}

/** Only the "at ..." frames: a stack's first line repeats the message, parameters included. */
function safeStack(stack: unknown): string | undefined {
  if (typeof stack !== "string") return undefined;
  const frames = stack.split("\n").filter((line) => /^\s+at /.test(line));
  return frames.length ? frames.slice(0, STACK_FRAMES).join("\n") : undefined;
}

function field(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

type RawError = Error & { code?: unknown; statusCode?: unknown; status?: unknown; query?: unknown; params?: unknown; severity?: unknown };

/** The error's class name. Drizzle's and postgres.js's errors are told by shape: their names do not survive minifying. */
function errorName(e: RawError): string {
  if (typeof e.query === "string" && Array.isArray(e.params)) return "DrizzleQueryError";
  if (typeof e.severity === "string" && typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return "PostgresError";
  return e.name;
}

/** What may be logged about an error: name, code, status, message head (safe classes only) and frames. */
export function safeError(e: unknown, depth = 0): Summary {
  if (!(e instanceof Error)) return { name: typeof e, message: UNLISTED };
  const raw = e as RawError;
  const name = errorName(raw);
  const summary: Summary = { name, message: messageFor(name, e.message) };
  const code = field(raw.code);
  if (code !== undefined) summary.code = code;
  const status = field(raw.statusCode) ?? field(raw.status);
  if (typeof status === "number") summary.status = status;
  const stack = safeStack(e.stack);
  if (stack) summary.stack = stack;
  // Drizzle wraps the driver's error (the Postgres code lives there); the AI SDK wraps the
  // last attempt. Two levels are enough to diagnose, and the cause is cleaned the same way.
  if (depth < 2 && e.cause !== undefined) summary.cause = safeError(e.cause, depth + 1);
  return summary;
}

/** console.error, minus anything a person wrote. `context` is for ids and job names only. */
export function logError(label: string, e: unknown, context?: Record<string, string | number | null>): void {
  console.error(label, { ...context, error: safeError(e) });
}
