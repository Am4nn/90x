import type { Breadcrumb, Event } from "@sentry/nextjs";
import { messageFor, PAYLOAD } from "@/lib/log";

/** Settings shared by the server and browser init, so the privacy rules live in one place. */
export const sharedSentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Off with no DSN: local, CI and e2e send nothing.
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  sendDefaultPii: false,
  beforeSend: scrubEvent,
  // Transactions (a tenth of server requests) carry the request URL and span data too.
  beforeSendTransaction: scrubEvent,
  beforeBreadcrumb: dropBodyBreadcrumbs,
};

const VALUE_MAX = 1000;
// Span data keys that can hold a query string or a whole URL.
const URL_KEYS = new Set(["url", "http.url", "url.full", "http.target"]);
// Span data a trace is read by: what kind of span, which route, method, status and host, and how
// long. Everything else goes (a request body, a statement, model input or output, a header), whatever
// an integration adds later. Only plain values are kept.
const SPAN_KEYS = new Set([
  "http.method",
  "http.request.method",
  "http.route",
  "http.status_code",
  "http.response.status_code",
  "url.path",
  "url.scheme",
  "server.address",
  "server.port",
  "network.protocol.version",
  "db.system",
  "db.operation",
  "db.name",
]);
const SPAN_PREFIXES = ["sentry.", "otel.", "next."];

function keepSpanKey(k: string): boolean {
  return URL_KEYS.has(k) || SPAN_KEYS.has(k) || SPAN_PREFIXES.some((p) => k.startsWith(p));
}

/** A URL with its query string and fragment cut off, so a search or a token in one never leaves. */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/** A message cut before any bound parameters or quoted model content (the same cut as logError), and capped. */
function scrubValue(value: string): string {
  const cut = value.split(PAYLOAD)[0] ?? "";
  return cut.length > VALUE_MAX ? `${cut.slice(0, VALUE_MAX)}…` : cut;
}

/** Sentry names a DrizzleQueryError "Error" (its own name); its message shape says what it is. */
function exceptionType(type: string | undefined, value: string): string | undefined {
  return type === "Error" && value.startsWith("Failed query: ") ? "DrizzleQueryError" : type;
}

/** Span data cut to the allowlisted keys with plain values, URLs without query strings: on child spans and on the transaction's own root span alike. */
function cleanSpanData(data: Record<string, unknown> | undefined): void {
  if (!data) return;
  for (const [k, v] of Object.entries(data)) {
    const plain = typeof v === "string" || typeof v === "number" || typeof v === "boolean";
    if (!keepSpanKey(k) || !plain) delete data[k];
    else if (URL_KEYS.has(k) && typeof v === "string") data[k] = stripQuery(v);
  }
}

/**
 * Keeps the user id only. No email, name, IP, cookies, headers, request body or query string,
 * an exception message only for an error class on lib/log.ts's safe list (cut before bound parameters), and no query strings in span data,
 * the root span's included.
 * Used for errors and transactions alike.
 */
export function scrubEvent<T extends Event>(event: T): T {
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url) event.request.url = stripQuery(event.request.url);
  }
  for (const exception of event.exception?.values ?? []) {
    // Only a class known to keep personal data out of its message keeps the message (lib/log.ts).
    if (exception.value) exception.value = messageFor(exceptionType(exception.type, exception.value), scrubValue(exception.value));
  }
  if (event.message) event.message = scrubValue(event.message);
  for (const span of event.spans ?? []) {
    // An HTTP span is described as "GET https://host/path?query".
    if (span.description && /^[A-Z]+ (https?:\/\/|\/)/.test(span.description)) span.description = stripQuery(span.description);
    cleanSpanData(span.data as Record<string, unknown> | undefined);
  }
  // A transaction's root span (the request itself, url.full with its query) travels in contexts.trace.
  cleanSpanData(event.contexts?.trace?.data as Record<string, unknown> | undefined);
  // A transaction named after a raw URL ("GET /coach?t=...") keeps only the path.
  if (event.type === "transaction" && event.transaction) event.transaction = stripQuery(event.transaction);
  return event;
}

/** Coach prompts and card answers travel in fetches and logs, so those breadcrumbs go. */
function dropBodyBreadcrumbs(breadcrumb: Breadcrumb): Breadcrumb | null {
  const category = breadcrumb.category ?? "";
  return category === "console" || category === "fetch" || category === "xhr" || category.startsWith("ui.") ? null : breadcrumb;
}
