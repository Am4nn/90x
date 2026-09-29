// "Design a URL shortener" reads as "URL shortener" in the picker.
export const topicLabel = (topic: string) => topic.replace(/^Design an? /i, "");

const normalise = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

/** Topics whose friendly label or raw name contains the query, in the order given.
 *  Returns the raw names: the server refuses anything that is not one of them. */
export function searchTopics(topics: readonly string[], query: string): string[] {
  const needle = normalise(query);
  if (!needle) return [...topics];
  return topics.filter((t) => normalise(topicLabel(t)).includes(needle) || normalise(t).includes(needle));
}
