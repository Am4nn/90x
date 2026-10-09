// The Library's topic list, as pure rules: how an area's topics fall into
// groups, how far along each one is, and the few words beside its title.
//
// A topic is one main card (its own lesson) plus its sub-cards (child topics). Each card is
// not started, opened (a minute spent on it, not finished) or done (studied).

export type CardState = "not_started" | "opened" | "done";

export type TopicInput = {
  slug: string;
  name: string;
  description: string | null;
  parent: string | null;
  section: string | null;
  state: CardState;
  /** The lesson has live audio: a headphones mark on its row or chip. */
  audio: boolean;
};

export type SubCard = { slug: string; name: string; state: CardState; audio: boolean };

export type TopicItem = {
  slug: string;
  name: string;
  description: string | null;
  subs: SubCard[];
  /** Cards finished, main card included. Opening a card does not move it. */
  done: number;
  /** The main card plus its sub-cards. */
  total: number;
  status: string | null;
  audio: boolean;
};

export type TopicGroup = { name: string; items: TopicItem[]; done: number };

/** The heading for an area whose topics have no sections yet, as in the design's AI tab. */
export const NO_SECTION = "Topics";

/** "x of y done" for a topic with sub-cards; "Continue" / "Done" for a single card; nothing untouched. */
export function topicStatus(states: CardState[]): string | null {
  const done = states.filter((s) => s === "done").length;
  if (done === states.length) return "Done";
  if (done === 0 && !states.includes("opened")) return null;
  return states.length === 1 ? "Continue" : `${done} of ${states.length} done`;
}

/**
 * Groups top-level topics by section, in the order the area's topics come in (their `sort`):
 * a section sits where its first topic does. Sub-cards follow their parent; a sub-card whose
 * parent is not listed is left out (it has nowhere to sit).
 */
export function groupTopics(rows: TopicInput[]): TopicGroup[] {
  const groups = new Map<string, TopicItem[]>();
  for (const t of rows) {
    if (t.parent) continue;
    const subs = rows.filter((c) => c.parent === t.slug).map((c) => ({ slug: c.slug, name: c.name, state: c.state, audio: c.audio }));
    const states = [t.state, ...subs.map((s) => s.state)];
    const item: TopicItem = {
      slug: t.slug,
      name: t.name,
      description: t.description,
      subs,
      done: states.filter((s) => s === "done").length,
      total: states.length,
      status: topicStatus(states),
      audio: t.audio,
    };
    const name = t.section?.trim() || NO_SECTION;
    groups.set(name, [...(groups.get(name) ?? []), item]);
  }
  return [...groups].map(([name, items]) => ({ name, items, done: items.filter((i) => i.done === i.total).length }));
}
