import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@/lib/monitoring/sentry-options";

// Server error reporting; does nothing without a DSN.
export function register() {
  Sentry.init({
    ...sharedSentryOptions,
    // Server timings for a tenth of requests: enough to see a slow route
    // (the coach chat, a heavy Today) without watching every call.
    tracesSampleRate: 0.1,
  });
}

export const onRequestError = Sentry.captureRequestError;
