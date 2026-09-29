import { describe, expect, it } from "vitest";
import { searchTopics, topicLabel } from "./topic-search";

const TOPICS = ["Design a URL shortener", "Design an API rate limiter", "Consistent hashing", "Caching strategies"];

describe("topicLabel", () => {
  it("strips a leading 'Design a' or 'Design an'", () => {
    expect(topicLabel("Design a URL shortener")).toBe("URL shortener");
    expect(topicLabel("Design an API rate limiter")).toBe("API rate limiter");
  });

  it("leaves other names alone", () => {
    expect(topicLabel("Consistent hashing")).toBe("Consistent hashing");
  });
});

describe("searchTopics", () => {
  it("returns every topic, in the order given, for an empty or blank query", () => {
    expect(searchTopics(TOPICS, "")).toEqual(TOPICS);
    expect(searchTopics(TOPICS, "   ")).toEqual(TOPICS);
  });

  it("matches case-insensitively", () => {
    expect(searchTopics(TOPICS, "CACHING")).toEqual(["Caching strategies"]);
  });

  it("finds the full name from the stripped label", () => {
    expect(searchTopics(TOPICS, "url shortener")).toEqual(["Design a URL shortener"]);
  });

  it("also matches the raw name", () => {
    expect(searchTopics(TOPICS, "design an")).toEqual(["Design an API rate limiter"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(searchTopics(TOPICS, "kubernetes")).toEqual([]);
  });

  it("returns the raw names, so what is posted is what the server allows", () => {
    for (const found of searchTopics(TOPICS, "r")) expect(TOPICS).toContain(found);
  });
});
