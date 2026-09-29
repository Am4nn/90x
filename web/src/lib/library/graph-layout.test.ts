import { describe, expect, it } from "vitest";
import { buildGraph } from "./graph-layout";

const node = (id: string, kind: "topic" | "subtopic", extra: { slug?: string | null; lesson?: boolean; done?: boolean } = {}) => ({
  id,
  label: id,
  kind,
  topicSlug: extra.slug === undefined ? id : extra.slug,
  hasLesson: extra.lesson ?? true,
  done: extra.done ?? false,
});

describe("buildGraph", () => {
  it("groups a topic and the subtopics after it into one spine entry with branches", () => {
    const graph = buildGraph([node("a", "topic"), node("a1", "subtopic"), node("a2", "subtopic")]);
    expect(graph.spine).toHaveLength(1);
    expect(graph.spine[0]?.branches.map((b) => b.node.id)).toEqual(["a1", "a2"]);
  });

  it("starts a new spine entry at each topic", () => {
    const graph = buildGraph([node("a", "topic"), node("a1", "subtopic"), node("b", "topic"), node("b1", "subtopic")]);
    expect(graph.spine.map((s) => s.node.id)).toEqual(["a", "b"]);
    expect(graph.spine[1]?.branches.map((b) => b.node.id)).toEqual(["b1"]);
  });

  it("keeps a subtopic that comes before any topic", () => {
    const graph = buildGraph([node("x", "subtopic"), node("a", "topic")]);
    expect(graph.orphans.map((b) => b.node.id)).toEqual(["x"]);
    expect(graph.spine.map((s) => s.node.id)).toEqual(["a"]);
  });

  it("marks a node without a lesson as soon, and still carries it for ticking", () => {
    const graph = buildGraph([node("a", "topic", { lesson: false }), node("a1", "subtopic", { slug: null, lesson: false })]);
    expect(graph.spine[0]?.soon).toBe(true);
    expect(graph.spine[0]?.href).toBeNull();
    expect(graph.spine[0]?.branches[0]).toMatchObject({ soon: true, href: null });
  });

  it("links only nodes that have a lesson and a slug", () => {
    const graph = buildGraph([node("a", "topic"), node("b", "topic", { slug: null, lesson: true })]);
    expect(graph.spine[0]?.href).toBe("/library/topic/a");
    expect(graph.spine[1]?.href).toBeNull();
  });

  it("keeps the order it is given, which is the sort order from the query", () => {
    const graph = buildGraph([node("z", "topic"), node("m", "topic"), node("a", "topic")]);
    expect(graph.spine.map((s) => s.node.id)).toEqual(["z", "m", "a"]);
  });

  it("highlights the first topic that is not done", () => {
    const graph = buildGraph([node("a", "topic", { done: true }), node("b", "topic"), node("c", "topic")]);
    expect(graph.spine.map((s) => s.current)).toEqual([false, true, false]);
  });

  it("highlights nothing when every topic is done", () => {
    const graph = buildGraph([node("a", "topic", { done: true })]);
    expect(graph.spine.some((s) => s.current)).toBe(false);
  });

  it("handles an empty list", () => {
    expect(buildGraph([])).toEqual({ spine: [], orphans: [] });
  });
});
