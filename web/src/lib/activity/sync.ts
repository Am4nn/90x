import type { Submission } from "./source";

export type { Submission };

export type SyncedAttempt = {
  slug: string;
  title: string;
  result: "solved" | "failed";
  attempts: number;
  minutesSuggested: number | null;
  externalId: string; // submission id: the accepted one, or the latest failure
  at: number;
};

const MAX_SUGGESTED_MINUTES = 120;
// A compile error isn't a real attempt at the problem.
const NOT_AN_ATTEMPT = new Set(["Compile Error"]);

/** Turn raw submissions into one attempt summary per problem. */
export function summarize(submissions: Submission[]): SyncedAttempt[] {
  const bySlug = new Map<string, Submission[]>();
  for (const s of [...submissions].sort((a, b) => a.timestamp - b.timestamp)) {
    const list = bySlug.get(s.slug) ?? [];
    list.push(s);
    bySlug.set(s.slug, list);
  }

  const out: SyncedAttempt[] = [];
  for (const [slug, list] of bySlug) {
    const firstAccepted = list.findIndex((s) => s.status === "Accepted");
    const upTo = firstAccepted >= 0 ? list.slice(0, firstAccepted + 1) : list;
    const real = upTo.filter((s) => !NOT_AN_ATTEMPT.has(s.status));
    if (real.length === 0) continue;

    if (firstAccepted >= 0) {
      const accepted = list[firstAccepted];
      const minutes = Math.round((accepted.timestamp - upTo[0].timestamp) / 60);
      out.push({
        slug,
        title: accepted.title,
        result: "solved",
        attempts: real.length,
        minutesSuggested: real.length > 1 ? Math.min(minutes, MAX_SUGGESTED_MINUTES) : null,
        externalId: accepted.id,
        at: accepted.timestamp,
      });
    } else {
      const last = real[real.length - 1];
      out.push({ slug, title: last.title, result: "failed", attempts: real.length, minutesSuggested: null, externalId: last.id, at: last.timestamp });
    }
  }
  return out;
}
