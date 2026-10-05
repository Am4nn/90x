import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

/** Settings shared by the server and browser init, so the privacy rules live in one place. */
export const sharedSentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Off with no DSN: local, CI and e2e send nothing.
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  sendDefaultPii: false,
  beforeSend: scrubEvent,
  beforeBreadcrumb: dropBodyBreadcrumbs,
};

/** Keeps the user id only. No email, name, IP, cookies, headers or request body. */
function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    delete event.request.query_string;
  }
  return event;
}

/** Coach prompts and card answers travel in fetches and logs, so those breadcrumbs go. */
function dropBodyBreadcrumbs(breadcrumb: Breadcrumb): Breadcrumb | null {
  const category = breadcrumb.category ?? "";
  return category === "console" || category === "fetch" || category === "xhr" || category.startsWith("ui.") ? null : breadcrumb;
}
