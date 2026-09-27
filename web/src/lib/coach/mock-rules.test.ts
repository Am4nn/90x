import { describe, expect, it } from "vitest";
import { feedbackMarkdown, mockMinutes, rubricScore, type Scored, scoredMock, stageAt } from "./mock-rules";

const start = new Date("2026-09-27T10:00:00Z");
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);

describe("stage plan", () => {
  it("gives a design mock 35 minutes and a behavioral one 20", () => {
    expect(mockMinutes("design")).toBe(35);
    expect(mockMinutes("behavioral")).toBe(20);
  });

  it("walks a design mock through requirements, high-level, deep dive and wrap-up", () => {
    expect(stageAt("design", start, at(0)).stage.key).toBe("requirements");
    expect(stageAt("design", start, at(4.9)).stage.key).toBe("requirements");
    expect(stageAt("design", start, at(5)).stage.key).toBe("high_level");
    expect(stageAt("design", start, at(15)).stage.key).toBe("deep_dive");
    expect(stageAt("design", start, at(30)).stage.key).toBe("wrap_up");
  });

  it("counts down the whole mock and the current stage", () => {
    const s = stageAt("design", start, at(7));
    expect(s.leftMs).toBe(28 * 60_000);
    expect(s.stageLeftMs).toBe(8 * 60_000);
    expect(s.index).toBe(1);
    expect(s.over).toBe(false);
  });

  it("walks a behavioral mock through question, follow-ups and reflection", () => {
    expect(stageAt("behavioral", start, at(1)).stage.key).toBe("question");
    expect(stageAt("behavioral", start, at(6)).stage.key).toBe("follow_ups");
    expect(stageAt("behavioral", start, at(16)).stage.key).toBe("reflection");
  });

  it("is over at the end and stays on the last stage with nothing left", () => {
    const s = stageAt("behavioral", start, at(25));
    expect(s.over).toBe(true);
    expect(s.stage.key).toBe("reflection");
    expect(s.leftMs).toBe(0);
    expect(s.stageLeftMs).toBe(0);
  });

  it("treats a clock slightly behind the server as the first stage", () => {
    const s = stageAt("design", start, at(-0.5));
    expect(s.stage.key).toBe("requirements");
    expect(s.leftMs).toBe(35 * 60_000);
  });

  it("accepts the database's timestamp string", () => {
    expect(stageAt("design", "2026-09-27 10:00:00+00", at(12)).stage.key).toBe("high_level");
  });
});

describe("rubricScore", () => {
  it("maps the mean of 1-5 onto 0-100", () => {
    expect(rubricScore([1, 1, 1, 1, 1])).toBe(0);
    expect(rubricScore([5, 5, 5, 5, 5])).toBe(100);
    expect(rubricScore([3, 3, 3, 3, 3])).toBe(50);
    expect(rubricScore([4, 3, 3, 4, 2])).toBe(55);
  });

  it("clamps out-of-range scores and ignores an empty rubric", () => {
    expect(rubricScore([7, 0])).toBe(50);
    expect(rubricScore([])).toBeNull();
  });
});

const raw = {
  rubric: [
    { key: "communication", score: 4, evidence: "Talked through each step." },
    { key: "requirements", score: 3, evidence: "Asked about scale late." },
    { key: "high_level", score: 4, evidence: "Clear API and storage split." },
    { key: "deep_dive", score: 2, evidence: "Hand-waved hash collisions." },
    { key: "trade_offs", score: 3, evidence: "Named SQL vs KV but no numbers." },
  ],
  strengths: ["a", "b", "c"],
  improvements: ["x", "y", "z"],
};

describe("scoredMock", () => {
  it("orders the rubric as the type defines it and scores it", () => {
    const s = scoredMock("design", raw) as Scored;
    expect(s.rubric.map((r) => r.key)).toEqual(["requirements", "high_level", "deep_dive", "trade_offs", "communication"]);
    expect(s.score).toBe(55);
    expect(s.rubric[0]?.label).toBe("Requirements");
  });

  it("rejects a rubric that misses a criterion or uses the other type's", () => {
    expect(scoredMock("design", { ...raw, rubric: raw.rubric.slice(1) })).toBeNull();
    expect(scoredMock("behavioral", raw)).toBeNull();
  });

  it("writes feedback markdown with the score, the rubric and both lists", () => {
    const md = feedbackMarkdown(scoredMock("design", raw) as Scored);
    expect(md).toContain("**55/100**");
    expect(md).toContain("- Deep dive: 2/5. Hand-waved hash collisions.");
    expect(md).toContain("## Strengths\n\n- a");
    expect(md).toContain("## To improve\n\n- x");
  });
});
