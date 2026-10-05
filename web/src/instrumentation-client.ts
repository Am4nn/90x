import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@/lib/monitoring/sentry-options";

// Browser error reporting; does nothing without a DSN, so local and CI send nothing.
Sentry.init({
  ...sharedSentryOptions,
  // Errors only in the browser: no timings, to keep the work on a phone small.
  tracesSampleRate: 0,
  // No Session Replay. It was configured to record only around an error, with
  // every piece of text masked - but the integration itself shipped in the shared
  // bootstrap, so it cost 40 KB gzipped on every cold start, 14% of the whole
  // thing, for a feature that fires when something has already gone wrong. 90x
  // opens from a Home Screen on a phone, often on a train.
  //
  // Lazy loading is not a way out: on-error replay works by buffering what
  // happened *before* the error, so an integration fetched after the error has
  // nothing to show. It is this or the 40 KB.
  //
  // To bring it back, restore `integrations: [Sentry.replayIntegration({
  // maskAllText: true, blockAllMedia: true })]` and the two sample rates, and
  // raise SHARED_CEILING in scripts/check-bundle.ts by about 40.
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
