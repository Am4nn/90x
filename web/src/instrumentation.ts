import * as Sentry from "@sentry/nextjs";

// Server error reporting; does nothing without a DSN.
export function register() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    tracesSampleRate: 0,
  });
}

export const onRequestError = Sentry.captureRequestError;
