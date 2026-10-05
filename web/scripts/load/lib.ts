// Shared bits for the local load test. LOCAL ONLY: it signs users in through the
// e2e-only test route, which answers 404 anywhere else.
import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const BASE = process.env.LOAD_BASE ?? "http://localhost:3100";

export type Sample = { ms: number; status: number; ok: boolean; err?: string };

export type Stats = {
  name: string;
  vus: number;
  seconds: number;
  requests: number;
  errors: number;
  errorRate: number;
  rate429: number;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  statuses: Record<string, number>;
};

export function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

export function summarize(name: string, vus: number, seconds: number, samples: Sample[]): Stats {
  const ms = samples.map((s) => s.ms).toSorted((a, b) => a - b);
  const statuses: Record<string, number> = {};
  for (const s of samples) statuses[s.err ? "net" : String(s.status)] = (statuses[s.err ? "net" : String(s.status)] ?? 0) + 1;
  const errors = samples.filter((s) => !s.ok).length;
  return {
    name,
    vus,
    seconds,
    requests: samples.length,
    errors,
    errorRate: samples.length ? errors / samples.length : 0,
    rate429: samples.filter((s) => s.status === 429).length,
    rps: samples.length / seconds,
    p50: pct(ms, 50),
    p95: pct(ms, 95),
    p99: pct(ms, 99),
    max: ms[ms.length - 1] ?? 0,
    statuses,
  };
}

/** Cookie header for a signed-in test user, via the e2e test route. */
export async function signIn(name: string, query = ""): Promise<string> {
  const res = await fetch(`${BASE}/api/test/sign-in?email=${encodeURIComponent(name)}@e2e.test&next=/today${query}`, {
    redirect: "manual",
  });
  const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0] ?? c);
  if (!cookies.length) throw new Error(`sign-in for ${name} gave ${res.status} and no cookies`);
  return cookies.join("; ");
}

export async function signInMany(prefix: string, n: number, parallel = 5, query = ""): Promise<string[]> {
  const out: string[] = Array.from({ length: n }, () => "");
  let next = 0;
  await Promise.all(
    Array.from({ length: parallel }, async () => {
      while (next < n) {
        const i = next++;
        out[i] = await signIn(`${prefix}${i}`, query);
      }
    }),
  );
  return out;
}

/** One timed GET. Counts 2xx as ok; a redirect to a sign-in or error page is not ok. */
export async function timedGet(path: string, cookie?: string): Promise<Sample> {
  const t = performance.now();
  try {
    const res = await fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });
    await res.arrayBuffer();
    return { ms: performance.now() - t, status: res.status, ok: res.status >= 200 && res.status < 300 };
  } catch (e) {
    return { ms: performance.now() - t, status: 0, ok: false, err: String(e) };
  }
}

/**
 * Ramps `vus` virtual users up evenly over `rampSeconds`, holds until `seconds` in total,
 * and records every iteration `iteration(vu)` returns. Closed loop: a VU starts its next
 * iteration as soon as the last one ends (no think time unless the iteration adds it).
 */
export async function runScenario(
  name: string,
  vus: number,
  seconds: number,
  iteration: (vu: number) => Promise<Sample[]>,
  rampSeconds = Math.min(10, seconds / 4),
): Promise<Stats> {
  const samples: Sample[] = [];
  const start = performance.now();
  const end = start + seconds * 1000;
  await Promise.all(
    Array.from({ length: vus }, async (_, vu) => {
      await sleep((vu / vus) * rampSeconds * 1000);
      while (performance.now() < end) samples.push(...(await iteration(vu)));
    }),
  );
  return summarize(name, vus, (performance.now() - start) / 1000, samples);
}

/** Postgres connection states, sampled while a scenario runs. */
export async function sampleDb(): Promise<{ total: number; active: number; idle: number; idleInTx: number }> {
  let text = "";
  try {
    const res = await execFileAsync("docker", [
      "exec",
      "supabase_db_90X",
      "psql",
      "-U",
      "postgres",
      "-At",
      "-F,",
      "-c",
      "select state, count(*) from pg_stat_activity where datname='postgres' and backend_type='client backend' group by state",
    ]);
    text = res.stdout;
  } catch {
    // docker missing or the container is down: report zeros, like an empty psql answer
  }
  const r = { total: 0, active: 0, idle: 0, idleInTx: 0 };
  for (const line of text.trim().split("\n")) {
    const [state, n] = line.split(",");
    const c = Number(n) || 0;
    r.total += c;
    if (state === "active") r.active += c;
    else if (state === "idle") r.idle += c;
    else if (state?.startsWith("idle in")) r.idleInTx += c;
  }
  return r;
}

const f = (n: number) => n.toFixed(0).padStart(6);

export function row(s: Stats): string {
  return `${s.name.padEnd(22)} vus=${String(s.vus).padStart(3)} req=${String(s.requests).padStart(6)} err=${(s.errorRate * 100).toFixed(1).padStart(5)}% 429=${String(s.rate429).padStart(4)} rps=${s.rps.toFixed(1).padStart(6)} p50=${f(s.p50)} p95=${f(s.p95)} p99=${f(s.p99)} max=${f(s.max)}ms ${JSON.stringify(s.statuses)}`;
}
