import type { ErrorEvent, Event } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubEvent, sharedSentryOptions, stripQuery } from "./sentry-options";

const NOTE = "my private check-in note";

describe("stripQuery", () => {
  it("cuts the query string and fragment", () => {
    expect(stripQuery("https://90x.example/coach?t=abc#x")).toBe("https://90x.example/coach");
    expect(stripQuery("/today")).toBe("/today");
  });
});

describe("scrubEvent", () => {
  it("drops personal fields and the query string from an error's request", () => {
    const event = scrubEvent({
      type: undefined,
      user: { id: "u1", email: "someone@example.test", ip_address: "1.2.3.4" },
      request: {
        url: "https://90x.example/review?checkin=abc",
        headers: { cookie: "x" },
        cookies: { a: "b" },
        data: NOTE,
        query_string: "q",
      },
    } as ErrorEvent);
    expect(event.user).toEqual({ id: "u1" });
    expect(event.request).toEqual({ url: "https://90x.example/review" });
  });

  it("cuts an exception message before the bound parameters of a failed query", () => {
    const event = scrubEvent({
      type: undefined,
      exception: { values: [{ type: "Error", value: `Failed query: insert into checkin_notes values ($1, $2)\nparams: u1,${NOTE}` }] },
    } as ErrorEvent);
    expect(event.exception?.values?.[0]?.value).toBe("Failed query: insert into checkin_notes values ($1, $2)");
  });

  it("scrubs transactions too: request URL and HTTP span query strings", () => {
    const event = scrubEvent({
      type: "transaction",
      request: { url: "https://90x.example/coach?t=thread-1", headers: { cookie: "x" } },
      spans: [
        {
          description: "GET https://api.example/v1/thing?key=secret",
          data: { url: "https://api.example/v1/thing?key=secret", "http.query": "?key=secret" },
          span_id: "1",
          trace_id: "t",
          start_timestamp: 0,
        },
        { description: "select * from cards where tags ? 'x'", data: {}, span_id: "2", trace_id: "t", start_timestamp: 0 },
      ],
    } as unknown as Event);
    expect(event.request).toEqual({ url: "https://90x.example/coach" });
    expect(event.spans?.[0]?.description).toBe("GET https://api.example/v1/thing");
    expect(event.spans?.[0]?.data).toEqual({ url: "https://api.example/v1/thing" });
    expect(event.spans?.[1]?.description).toBe("select * from cards where tags ? 'x'");
    expect(JSON.stringify(event)).not.toContain("secret");
  });

  it("cleans the transaction's root span and name, which travel outside event.spans", () => {
    const event = scrubEvent({
      type: "transaction",
      transaction: "GET /coach?t=thread-1",
      contexts: {
        trace: {
          trace_id: "t",
          span_id: "1",
          data: { "url.full": "https://90x.example/coach?t=thread-1", "url.query": "t=thread-1", "http.target": "/coach?t=thread-1" },
        },
      },
    } as unknown as Event);
    expect(event.transaction).toBe("GET /coach");
    expect(event.contexts?.trace?.data).toEqual({ "url.full": "https://90x.example/coach", "http.target": "/coach" });
    expect(JSON.stringify(event)).not.toContain("thread-1");
  });

  it("keeps only allowlisted span data: no request body, statement or model content", () => {
    const event = scrubEvent({
      type: "transaction",
      contexts: {
        trace: {
          trace_id: "t",
          span_id: "1",
          data: { "http.request.body": NOTE, "http.route": "/coach", "sentry.op": "http.server", "http.response.status_code": 200 },
        },
      },
      spans: [
        {
          description: "ai.generate",
          data: {
            "ai.prompt": NOTE,
            "ai.response.text": NOTE,
            "db.statement": `insert ... '${NOTE}'`,
            "next.span_type": "x",
            headers: { a: 1 },
          },
          span_id: "2",
          trace_id: "t",
          start_timestamp: 0,
        },
      ],
    } as unknown as Event);
    expect(event.contexts?.trace?.data).toEqual({ "http.route": "/coach", "sentry.op": "http.server", "http.response.status_code": 200 });
    expect(event.spans?.[0]?.data).toEqual({ "next.span_type": "x" });
    expect(JSON.stringify(event)).not.toContain(NOTE);
  });

  it("sends an AI validation error's class with a fixed line, never the model output", () => {
    const event = scrubEvent({
      type: undefined,
      exception: {
        values: [
          { type: "AI_TypeValidationError", value: `Type validation failed: Value: {"answer":"${NOTE}"}.` },
          { type: "Error", value: `JSON parsing failed: Text: ${NOTE}.` },
        ],
      },
    } as ErrorEvent);
    expect(event.exception?.values?.map((v) => v.value)).toEqual(["model content withheld", "message withheld"]);
  });

  it("withholds the message of an error class not known to be safe, and keeps a safe one's", () => {
    const event = scrubEvent({
      type: undefined,
      exception: {
        values: [
          { type: "Error", value: "Invalid recipient: invitee@example.test" },
          { type: "TypeError", value: "Cannot read properties of undefined (reading 'id')" },
        ],
      },
    } as ErrorEvent);
    expect(event.exception?.values?.map((v) => v.value)).toEqual([
      "message withheld",
      "Cannot read properties of undefined (reading 'id')",
    ]);
  });

  it("is installed for both errors and transactions", () => {
    expect(sharedSentryOptions.beforeSend).toBe(scrubEvent);
    expect(sharedSentryOptions.beforeSendTransaction).toBe(scrubEvent);
  });
});
