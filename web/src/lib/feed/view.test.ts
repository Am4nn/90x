import { describe, expect, it } from "vitest";
import {
  accuracyPercent,
  cardView,
  missionBanner,
  nextReviewText,
  parseDiagnostic,
  parseFeedAreas,
  parseQueueItem,
  scoreLine,
  sourceLinks,
  summarizeDiagnostic,
} from "./view";

describe("parseFeedAreas", () => {
  it("null means every area is on", () => {
    expect(parseFeedAreas(null)).toEqual(["dsa", "system_design", "cs", "java", "sql"]);
  });

  it("keeps known areas in the usual order", () => {
    expect(parseFeedAreas({ areas: ["sql", "lld", "dsa", "sql"] })).toEqual(["dsa", "sql"]);
  });

  it("an empty list means every area is off", () => {
    expect(parseFeedAreas({ areas: [] })).toEqual([]);
  });

  it("falls back to every area when the value is malformed", () => {
    expect(parseFeedAreas("dsa")).toHaveLength(5);
    expect(parseFeedAreas({ areas: "dsa" })).toHaveLength(5);
  });
});

describe("parseQueueItem", () => {
  it("reads JSON strings and already-parsed objects", () => {
    expect(parseQueueItem('{"id":"c1","reason":"due"}')).toEqual({ id: "c1", reason: "due" });
    expect(parseQueueItem({ id: "c1", reason: "weak" })).toEqual({ id: "c1", reason: "weak" });
  });

  it("rejects anything else", () => {
    expect(parseQueueItem(null)).toBeNull();
    expect(parseQueueItem("not json")).toBeNull();
    expect(parseQueueItem({ id: "c1", reason: "because" })).toBeNull();
    expect(parseQueueItem({ id: 3, reason: "new" })).toBeNull();
  });
});

describe("parseDiagnostic", () => {
  it("reads the remaining ids and the total", () => {
    expect(parseDiagnostic('{"ids":["a","b"],"total":20}')).toEqual({ ids: ["a", "b"], total: 20 });
    expect(parseDiagnostic({ ids: [], total: 3 })).toEqual({ ids: [], total: 3 });
  });

  it("returns null when there is no diagnostic", () => {
    expect(parseDiagnostic(null)).toBeNull();
    expect(parseDiagnostic({ ids: "a", total: 1 })).toBeNull();
  });
});

describe("cardView", () => {
  const row = {
    id: "c1",
    format: "typed",
    difficulty: "Medium",
    promptMd: "Why?",
    options: ["A", "B"],
    sourceRefs: [{ kind: "doc", id: "d1", title: "Java docs" }],
    topicSlug: "java-maps",
    topicName: "HashMap",
    area: "java",
  };

  it("maps the row without the answer", () => {
    const view = cardView(row, "weak", null);
    expect(view).toEqual({
      id: "c1",
      format: "typed",
      difficulty: "Medium",
      promptMd: "Why?",
      options: null,
      topic: { slug: "java-maps", name: "HashMap", area: "java" },
      reason: "weak",
      sourceTitle: "Java docs",
      canDeclareKnown: false,
      diagnostic: null,
    });
    expect(Object.keys(view ?? {})).not.toContain("answerMd");
  });

  it("sends options only for multiple choice", () => {
    expect(cardView({ ...row, format: "mcq" }, "new", null)?.options).toEqual(["A", "B"]);
  });

  it("an mcq with no options is a typed card", () => {
    expect(cardView({ ...row, format: "mcq", options: [] }, "new", null)?.options).toBeNull();
  });

  it("drops cards outside the feed areas", () => {
    expect(cardView({ ...row, area: "lld" }, "new", null)).toBeNull();
  });
});

describe("sourceLinks", () => {
  it("links problems and documents into the Library", () => {
    expect(
      sourceLinks([
        { kind: "problem", id: "two-sum", title: "Two Sum" },
        { kind: "doc", id: "os/paging", title: "Paging" },
        { kind: "web", id: "x", title: "Elsewhere" },
        { kind: "doc", id: "y" },
      ]),
    ).toEqual([
      { title: "Two Sum", href: "/library/problem/two-sum" },
      { title: "Paging", href: "/library/doc/os%2Fpaging" },
      { title: "Elsewhere", href: null },
    ]);
  });

  it("is empty for anything that isn't a list", () => {
    expect(sourceLinks(null)).toEqual([]);
  });
});

describe("summarizeDiagnostic", () => {
  it("counts answers and correct ones per area, in area order", () => {
    expect(
      summarizeDiagnostic([
        { area: "sql", outcome: "correct" },
        { area: "dsa", outcome: "wrong" },
        { area: "dsa", outcome: "correct" },
        { area: "dsa", outcome: "skipped" },
      ]),
    ).toEqual([
      { area: "dsa", answered: 3, correct: 1 },
      { area: "sql", answered: 1, correct: 1 },
    ]);
  });
});

describe("nextReviewText", () => {
  const now = new Date("2026-09-27T10:00:00Z");
  it("says tomorrow for a day out", () => {
    expect(nextReviewText("2026-09-28T10:00:00Z", now)).toBe("Next review tomorrow");
    expect(nextReviewText("2026-09-27T12:00:00Z", now)).toBe("Next review tomorrow");
  });
  it("counts days after that", () => {
    expect(nextReviewText("2026-10-03T10:00:00Z", now)).toBe("Next review in 6 days");
  });
});

describe("scoreLine", () => {
  it("counts key points when they were graded", () => {
    expect(scoreLine({ outcome: "wrong", pointsHit: [true, false, true, true] })).toBe("3 of 4 key points");
  });
  it("says correct or not otherwise", () => {
    expect(scoreLine({ outcome: "correct", pointsHit: null })).toBe("Correct");
    expect(scoreLine({ outcome: "wrong", pointsHit: null })).toBe("Not quite");
    expect(scoreLine({ outcome: "skipped", pointsHit: null })).toBe("Skipped");
  });
});

describe("session", () => {
  it("shows the missions banner from 20 answers while missions are open", () => {
    expect(missionBanner({ answered: 20, correct: 0, skipped: 0, openMissions: 1 })).toBe(true);
    expect(missionBanner({ answered: 19, correct: 0, skipped: 5, openMissions: 1 })).toBe(false);
    expect(missionBanner({ answered: 30, correct: 0, skipped: 0, openMissions: 0 })).toBe(false);
  });

  it("accuracy is correct over answered, none before the first answer", () => {
    expect(accuracyPercent({ answered: 3, correct: 2, skipped: 1, openMissions: 0 })).toBe(67);
    expect(accuracyPercent({ answered: 0, correct: 0, skipped: 2, openMissions: 0 })).toBeNull();
  });
});
