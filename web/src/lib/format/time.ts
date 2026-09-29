/** Relative times in the app's two vocabularies. `ago` is day-based and reads
 *  like a history line ("today", "yesterday", "2 days ago"); `relative` is
 *  minute-based and reads like a status line ("just now", "3m ago", "3h ago",
 *  "2d ago"). Both read the clock, so a server and a client can differ by a
 *  boundary; that mismatch is text-only and harmless. */
export function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

export function relative(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
