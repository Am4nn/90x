export type HealthCheck = "database" | "redis";

/** Turns the dependency results into the status and body UptimeRobot sees.
 *  Names only: no error text, so nothing about the setup leaks to a stranger. */
export function healthResponse(results: Record<HealthCheck, boolean>): {
  status: 200 | 503;
  body: { ok: boolean; failed?: HealthCheck[] };
} {
  const failed = (Object.keys(results) as HealthCheck[]).filter((name) => !results[name]);
  return failed.length === 0 ? { status: 200, body: { ok: true } } : { status: 503, body: { ok: false, failed } };
}

/** True if the check finishes without throwing before the deadline. A hung
 *  dependency counts as down, so the monitor gets an answer rather than a timeout. */
export async function passes(check: () => Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
