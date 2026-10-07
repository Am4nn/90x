import "server-only";
import { Receiver } from "@upstash/qstash";
import type { Judge } from "@/lib/jobs/record";
import { jobIdOfPath } from "@/lib/jobs/registry";
import { recordJob } from "@/lib/jobs/store";
import { skippedForMaintenance } from "@/lib/maintenance/flag";

/** Verifies a QStash request, including that it was signed for this exact URL,
 *  so a job meant for Curfew (same QStash account) can't trigger 90x. */
async function verifyQStash(request: Request, body: string, path: string): Promise<boolean> {
  const signature = request.headers.get("upstash-signature");
  if (!signature) return false;
  const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
  });
  const url = `${process.env.NEXT_PUBLIC_APP_URL!.replace(/\/$/, "")}${path}`;
  try {
    return await receiver.verify({ signature, body, url });
  } catch {
    return false;
  }
}

/** Wraps a scheduled job so the signature check (and the maintenance skip) cannot be left out.
 *
 *  Every job route opened with the same four lines - read the body, verify, 401
 *  on failure - and a route that forgets them is an endpoint anyone can POST to.
 *  Making it the wrapper's job means a new schedule gets the check by
 *  construction rather than by the author remembering.
 *
 *  The body is read once here and handed on, because a Request body can only be
 *  consumed once and verification needs the raw text.
 *
 *  Every verified run is also recorded in job_runs under the path's last part
 *  ("/api/jobs/hourly" -> "hourly"), for the Scheduled jobs section of Analytics.
 *  `judge` turns the job's return value into ok / failed / skipped; without one a
 *  run that returns is ok. Recording never fails the job.
 */
export function qstashJob<T>(path: string, run: (body: string) => Promise<T>, judge?: Judge<T>) {
  const job = jobIdOfPath(path);
  return async function POST(request: Request) {
    const body = await request.text();
    if (!(await verifyQStash(request, body, path))) {
      return Response.json({ error: "invalid signature" }, { status: 401 });
    }
    // While the app is down nothing scheduled runs. A 200, so QStash counts the call done and does not retry it.
    // The skip is still recorded, so Analytics shows "skipped" rather than "late".
    if (await skippedForMaintenance("job", { path })) {
      const skipped = { skipped: "maintenance" };
      return Response.json(
        await recordJob(
          job,
          async () => skipped,
          () => ({ status: "skipped", result: skipped }),
        ),
      );
    }
    return Response.json((await recordJob(job, () => run(body), judge)) ?? { ok: true });
  };
}
