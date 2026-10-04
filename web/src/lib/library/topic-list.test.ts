import { describe, expect, it } from "vitest";
import { type CardState, groupTopics, NO_SECTION, type TopicInput, topicStatus } from "./topic-list";

const topic = (slug: string, over: Partial<TopicInput> = {}): TopicInput => ({
  slug,
  name: slug,
  description: null,
  parent: null,
  section: null,
  state: "not_started",
  ...over,
});

describe("topicStatus", () => {
  it.each<[CardState[], string | null]>([
    [["not_started"], null],
    [["opened"], "Continue"],
    [["done"], "Done"],
    [["not_started", "not_started", "not_started"], null],
    [["opened", "not_started", "not_started"], "0 of 3 done"],
    [["not_started", "opened", "not_started"], "0 of 3 done"],
    [["done", "not_started", "not_started"], "1 of 3 done"],
    [["not_started", "done", "done"], "2 of 3 done"],
    [["done", "done", "done"], "Done"],
  ])("%j -> %s", (states, want) => {
    expect(topicStatus(states)).toBe(want);
  });
});

describe("groupTopics", () => {
  it("puts every topic in one group named Topics when the area has no sections", () => {
    const groups = groupTopics([topic("a"), topic("b")]);
    expect(groups.map((g) => g.name)).toEqual([NO_SECTION]);
    expect(groups[0]!.items.map((i) => i.slug)).toEqual(["a", "b"]);
  });

  it("orders sections by their first topic and keeps the topics' own order inside", () => {
    const groups = groupTopics([
      topic("a", { section: "Foundations" }),
      topic("b", { section: "Querying" }),
      topic("c", { section: "Foundations" }),
      topic("d", { section: "Performance" }),
    ]);
    expect(groups.map((g) => [g.name, g.items.map((i) => i.slug)])).toEqual([
      ["Foundations", ["a", "c"]],
      ["Querying", ["b"]],
      ["Performance", ["d"]],
    ]);
  });

  it("counts only finished cards on the ring: the main card plus its sub-cards", () => {
    const [group] = groupTopics([
      topic("joins", { state: "opened" }),
      topic("inner", { parent: "joins", state: "done" }),
      topic("subquery", { parent: "joins", state: "opened" }),
    ]);
    const joins = group!.items[0]!;
    expect(joins.subs.map((s) => [s.slug, s.state])).toEqual([
      ["inner", "done"],
      ["subquery", "opened"],
    ]);
    expect([joins.done, joins.total, joins.status]).toEqual([1, 3, "1 of 3 done"]);
  });

  it("counts a group's topics only when every card in them is done", () => {
    const [group] = groupTopics([
      topic("a", { state: "done" }),
      topic("b", { state: "done" }),
      topic("b1", { parent: "b", state: "not_started" }),
      topic("c", { state: "opened" }),
    ]);
    expect(group!.done).toBe(1);
  });

  it("leaves out a sub-card whose parent is not listed", () => {
    const groups = groupTopics([topic("a"), topic("orphan", { parent: "gone" })]);
    expect(groups[0]!.items.map((i) => i.slug)).toEqual(["a"]);
  });

  it("treats a blank section as no section", () => {
    expect(groupTopics([topic("a", { section: "  " })])[0]!.name).toBe(NO_SECTION);
  });
});
