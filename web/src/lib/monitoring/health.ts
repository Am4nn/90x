export type HealthCheck = "database" | "redis";

/** Which deploy answered: short commit, branch and region. All three are public
 *  already (the repo is public, the region is in every response's x-vercel-id). */
export type Version = { commit: string | null; branch: string | null; region: string | null };

/** Read from the variables Vercel sets on every deployment; null outside Vercel. */
export function deployVersion(env: Record<string, string | undefined> = process.env): Version {
  return {
    commit: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
    branch: env.VERCEL_GIT_COMMIT_REF || null,
    region: env.VERCEL_REGION || null,
  };
}

export type CheckState = "up" | "down";

/** Turns the dependency results into the status and body the monitors see: each
 *  check as up or down, and which deploy answered. Names and states only, never
 *  error text, so nothing about the setup leaks to a stranger. */
export function healthResponse(
  results: Record<HealthCheck, boolean>,
  version: Version,
): {
  status: 200 | 503;
  body: { ok: boolean; checks: Record<HealthCheck, CheckState>; version: Version };
} {
  const names = Object.keys(results) as HealthCheck[];
  const checks = Object.fromEntries(names.map((name) => [name, results[name] ? "up" : "down"])) as Record<HealthCheck, CheckState>;
  const ok = names.every((name) => results[name]);
  return { status: ok ? 200 : 503, body: { ok, checks, version } };
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
