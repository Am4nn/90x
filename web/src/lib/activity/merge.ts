import type { Submission } from "./source";

export type Recent = { title: string; titleSlug: string; timestamp: string; statusDisplay: string; lang: string };
export type RecentAc = { id: string; title: string; titleSlug: string; timestamp: string; lang: string };

/** LeetCode's mixed list has statuses but no ids; the accepted list has ids.
 *  Accepted solves get their real id, everything else a stable slug:time id. */
export function mergeSubmissions(recent: Recent[], accepted: RecentAc[]): Submission[] {
  const acceptedIds = new Map(accepted.map((a) => [`${a.titleSlug}:${a.timestamp}`, a.id]));
  const seen = new Set<string>();
  const out: Submission[] = recent.map((r) => {
    const key = `${r.titleSlug}:${r.timestamp}`;
    seen.add(key);
    return {
      id: (r.statusDisplay === "Accepted" && acceptedIds.get(key)) || key,
      slug: r.titleSlug,
      title: r.title,
      timestamp: Number(r.timestamp),
      status: r.statusDisplay,
      lang: r.lang,
    };
  });
  for (const a of accepted) {
    if (!seen.has(`${a.titleSlug}:${a.timestamp}`)) {
      out.push({ id: a.id, slug: a.titleSlug, title: a.title, timestamp: Number(a.timestamp), status: "Accepted", lang: a.lang });
    }
  }
  return out;
}
