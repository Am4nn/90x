import * as Sentry from "@sentry/nextjs";

// Browser error reporting; does nothing without a DSN, so local and CI send nothing.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  // A fifth of page loads carry timings, which is plenty at this size.
  tracesSampleRate: 0.2,
  // Replay only around an error: never a normal session, and every piece of
  // text is masked, so check-in notes and coach chats are never recorded.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
