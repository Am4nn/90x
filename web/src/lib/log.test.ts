import { JSONParseError, NoObjectGeneratedError, TypeValidationError } from "ai";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logError, safeError, safeMessage } from "./log";

afterEach(() => vi.restoreAllMocks());

const NOTE = "my private check-in note about the interview";
const EMAIL = "invitee@example.test";

function drizzleFailure(): Error {
  const cause = Object.assign(new Error('duplicate key value violates unique constraint "friend_invites_pending_idx"'), {
    name: "PostgresError",
    code: "23505",
    detail: `Key (email)=(${EMAIL}) already exists.`,
  });
  return new DrizzleQueryError('insert into "checkin_notes" ("user_id", "body") values ($1, $2)', ["u1", NOTE], cause);
}

function aiFailure(): Error {
  return Object.assign(new Error("Too many requests"), {
    name: "AI_APICallError",
    statusCode: 429,
    requestBodyValues: { messages: [{ role: "user", content: NOTE }] },
    responseBody: `{"error":"rate limited","echo":"${NOTE}"}`,
  });
}

describe("safeMessage", () => {
  it("cuts a Drizzle message before its bound parameters", () => {
    expect(safeMessage("Failed query: select 1\nparams: secret,values")).toBe("Failed query: select 1");
  });

  it("keeps only the first line and caps the length", () => {
    expect(safeMessage(`a\nb`)).toBe("a");
    expect(safeMessage("x".repeat(1000)).length).toBeLessThanOrEqual(301);
  });
});

describe("safeError", () => {
  it("logs a failed query by name, Postgres code and stack, never its parameters or detail", () => {
    const out = JSON.stringify(safeError(drizzleFailure()));
    expect(out).not.toContain(NOTE);
    expect(out).not.toContain(EMAIL);
    expect(out).not.toContain("params:");
    expect(out).toContain("DrizzleQueryError");
    expect(out).toContain("23505");
    expect(out).toContain("Failed query: insert into");
  });

  it("logs an AI call failure by status, never the request or response body", () => {
    const summary = safeError(aiFailure());
    expect(summary).toMatchObject({ name: "AI_APICallError", status: 429, message: "Too many requests" });
    expect(JSON.stringify(summary)).not.toContain(NOTE);
  });

  it("keeps stack frames but not the stack's first line, which repeats the message", () => {
    const summary = safeError(drizzleFailure());
    expect(summary.stack).toMatch(/^\s+at /);
    expect(summary.stack).not.toContain(NOTE);
  });

  it("never logs model output from an AI validation error, only its class and a fixed line", () => {
    const invalid = new TypeValidationError({ value: { answer: NOTE }, cause: new Error("x") });
    const unparsed = new JSONParseError({ text: `{"answer": "${NOTE}"`, cause: new Error("x") });
    const wrapped = new NoObjectGeneratedError({
      cause: invalid,
      text: NOTE,
      response: { id: "r", timestamp: new Date(0), modelId: "m" },
      usage: {} as never,
      finishReason: "stop",
    });
    for (const e of [invalid, unparsed, wrapped]) expect(JSON.stringify(safeError(e))).not.toContain(NOTE);
    expect(safeError(invalid)).toMatchObject({ name: "AI_TypeValidationError", message: "model content withheld" });
    expect(safeError(wrapped).cause).toMatchObject({ name: "AI_TypeValidationError", message: "model content withheld" });
  });

  it("cuts a quoted value out of any message, whatever the class", () => {
    expect(safeMessage(`Type validation failed: Value: {"answer":"${NOTE}"}.`)).toBe("Type validation failed");
    expect(safeMessage(`JSON parsing failed: Text: ${NOTE}.`)).toBe("JSON parsing failed");
  });

  it("handles things that are not errors", () => {
    expect(safeError("boom")).toEqual({ name: "string", message: "message withheld" });
    expect(JSON.stringify(safeError({ body: NOTE }))).not.toContain(NOTE);
  });
});

describe("messages of unknown error classes", () => {
  it("are withheld, whatever they say; the class name and stack stay", () => {
    const summary = safeError(new Error(`Invalid recipient: ${EMAIL}`));
    expect(summary.name).toBe("Error");
    expect(summary.message).toBe("message withheld");
    expect(summary.stack).toMatch(/^\s+at /);
    expect(JSON.stringify(summary)).not.toContain(EMAIL);
  });

  it("are kept for a class on the safe list", () => {
    expect(safeError(new TypeError("x.map is not a function")).message).toBe("x.map is not a function");
    const pg = Object.assign(new Error('relation "nope" does not exist'), { severity: "ERROR", code: "42P01" });
    expect(safeError(pg)).toMatchObject({ name: "PostgresError", code: "42P01", message: 'relation "nope" does not exist' });
  });
});

describe("logError", () => {
  it("prints the label, the context ids and the cleaned error only", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("check-in note not saved", drizzleFailure(), { userId: "u1" });
    expect(spy).toHaveBeenCalledOnce();
    const printed = JSON.stringify(spy.mock.calls[0]);
    expect(printed).toContain("check-in note not saved");
    expect(printed).toContain("u1");
    expect(printed).not.toContain(NOTE);
    expect(printed).not.toContain(EMAIL);
  });
});
