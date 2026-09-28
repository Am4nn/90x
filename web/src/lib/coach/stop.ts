import "server-only";
import { key } from "@/lib/upstash/keys";
import { redis } from "@/lib/upstash/redis";

// Telling "I pressed Stop" apart from "I closed the app".
//
// At the HTTP level they are the same event: the client stops reading and the
// request aborts. But they mean opposite things. Closing the app should leave the
// answer to finish and be waiting on return; pressing Stop should stop the model
// immediately, because the reader has said they do not want it and every further
// token is billed for nothing.
//
// So generation no longer follows the connection, and Stop says so out of band:
// the client posts, this records when, and the run aborts if it sees a stop that
// was asked for after it began. Redis rather than memory because the flag has to
// reach whichever instance is running the reply, which is not necessarily the one
// that takes the stop request.
//
// The flag holds a timestamp rather than a marker, and nothing clears it at the
// start of a run. Clearing was a race: press Stop, send another message straight
// away, and the new request could wipe the flag before the old reply noticed it -
// so the unwanted answer carried on - or the stop could land after the clear and
// kill the new reply instead. A run ignores any stop older than itself, which
// needs no coordination between the two.

/** Long enough to outlive the slowest reply, short enough to forget. */
const TTL_SECONDS = 360;
const POLL_MS = 1500;

const stopKey = (userId: string, threadId: string) => key("coach", "stop", userId, threadId);

/** The reader pressed Stop, at this moment. */
export async function requestStop(userId: string, threadId: string, at = Date.now()): Promise<void> {
  await redis().set(stopKey(userId, threadId), String(at), { ex: TTL_SECONDS });
}

/**
 * Aborts the returned signal when a stop arrives that was asked for after
 * `startedAt`.
 *
 * Polling, because Redis has no push to wait on here and a reply is short lived:
 * one GET every 1.5 seconds for the life of an answer. `done()` stops the polling
 * and must run whether the reply finished, failed or never started, or the
 * interval outlives the request that made it.
 *
 * The comparison is between clocks on two machines, so a few hundred milliseconds
 * of skew could let a stop pressed at almost the same instant as a new message
 * apply to the wrong one of them. That is a far smaller window than the clear it
 * replaces, and the cost either way is one reply.
 */
export function stopSignal(userId: string, threadId: string, startedAt = Date.now()): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setInterval(async () => {
    try {
      const asked = Number(await redis().get(stopKey(userId, threadId)));
      if (Number.isFinite(asked) && asked >= startedAt) {
        controller.abort(new Error("the reader pressed Stop"));
        clearInterval(timer);
      }
    } catch {
      // A Redis blip must not abort a reply that is going fine.
    }
  }, POLL_MS);
  // Node keeps the process alive for a pending interval; this one is bookkeeping.
  timer.unref?.();
  return { signal: controller.signal, done: () => clearInterval(timer) };
}
