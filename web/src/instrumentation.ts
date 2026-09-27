import * as Sentry from "@sentry/nextjs";

// Server error reporting; does nothing without a DSN.
export function register() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    // Server timings for a fifth of requests: enough to see a slow route
    // (the coach chat, a heavy Today) without watching every call.
    tracesSampleRate: 0.2,
  });
}

export const onRequestError = Sentry.captureRequestError;
