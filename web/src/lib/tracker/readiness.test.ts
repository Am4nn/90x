import { describe, expect, it } from "vitest";
import { band, dsaArea, localAttempts, MIN_AREA_ANSWERS, overall, shownAreaScore, shownOverall, topicArea } from "./readiness";

const important = [
  { slug: "a", importance: 1 },
  { slug: "b", importance: 1 },
  { slug: "c", importance: 2 },
];

describe("dsaArea", () => {
  it("has no score before any attempt", () => {
    expect(dsaArea(important, [], "2026-09-27").score).toBeNull();
  });

  it("coverage is importance-weighted; accuracy counts solved 1, hints 0.5, failed 0", () => {
    const got = dsaArea(
      important,
      [
        { slug: "c", result: "solved", date: "2026-08-01" },
        { slug: "a", result: "hints", date: "2026-08-01" },
      ],
      "2026-09-27",
    );
    expect(got.coverage).toBeCloseTo(3 / 4);
    expect(got.accuracy).toBeCloseTo(0.75);
    expect(got.score).toBe(56);
  });

  it("the last 14 days count double", () => {
    const got = dsaArea(
      important,
      [
        { slug: "a", result: "failed", date: "2026-08-01" },
        { slug: "b", result: "solved", date: "2026-09-20" },
      ],
      "2026-09-27",
    );
    expect(got.accuracy).toBeCloseTo(2 / 3);
  });

  it("attempts on unimportant problems add accuracy but not coverage", () => {
    const got = dsaArea(important, [{ slug: "zzz", result: "solved", date: "2026-09-27" }], "2026-09-27");
    expect(got.coverage).toBe(0);
    expect(got.score).toBe(0);
  });
});

describe("dsaArea with cards", () => {
  it("blends check-ins and card scores, weighted by count", () => {
    const got = dsaArea(important, [{ slug: "c", result: "solved", date: "2026-08-01" }], "2026-09-27", [
      { topic: "two-pointers", score: 0.5, skipped: false, date: "2026-08-01" },
      { topic: "heap", score: 0, skipped: true, date: "2026-08-01" },
    ]);
    expect(got.coverage).toBeCloseTo(2 / 4);
    expect(got.accuracy).toBeCloseTo(1.5 / 3);
    expect(got.score).toBe(25);
  });

  it("card answers alone give an accuracy", () => {
    const got = dsaArea(important, [], "2026-09-27", [{ topic: "heap", score: 1, skipped: false, date: "2026-09-27" }]);
    expect(got.accuracy).toBe(1);
    expect(got.score).toBe(0);
  });
});

describe("topicArea", () => {
  const topics = [
    { slug: "x", importance: 1 },
    { slug: "y", importance: 3 },
  ];

  it("reports coverage but no score until card answers exist", () => {
    const got = topicArea(topics, new Set(["y"]));
    expect(got.coverage).toBeCloseTo(0.75);
    expect(got.accuracy).toBeNull();
    expect(got.score).toBeNull();
  });

  it("topics with answered cards count as covered; skips don't", () => {
    const got = topicArea(topics, new Set(), {
      today: "2026-09-27",
      attempts: [
        { topic: "x", score: 1, skipped: false, date: "2026-09-27" },
        { topic: "y", score: 0, skipped: true, date: "2026-09-27" },
      ],
    });
    expect(got.coverage).toBeCloseTo(0.25);
    expect(got.accuracy).toBeCloseTo(0.5);
    expect(got.score).toBe(13);
  });

  it("card scores from the last 14 days count double", () => {
    const got = topicArea(topics, new Set(["x", "y"]), {
      today: "2026-09-27",
      attempts: [
        { topic: "x", score: 1, skipped: false, date: "2026-09-14" },
        { topic: "y", score: 0.25, skipped: false, date: "2026-09-13" },
      ],
    });
    expect(got.accuracy).toBeCloseTo((1 * 2 + 0.25) / 3);
    expect(got.score).toBe(75);
  });
});

describe("overall", () => {
  it("is the weighted mean of areas that have a score", () => {
    expect(overall({ dsa: 60, system_design: null, cs: null, java: 40, sql: null })).toBe(Math.round((60 * 35 + 40 * 15) / 50));
  });

  it("is null with no data", () => {
    expect(overall({ dsa: null, system_design: null })).toBeNull();
  });
});

describe("band", () => {
  it("red under 40, yellow to 69, green from 70", () => {
    expect(band(39)).toBe("bad");
    expect(band(40)).toBe("warn");
    expect(band(69)).toBe("warn");
    expect(band(70)).toBe("ok");
  });
});

describe("localAttempts", () => {
  it("dates each check-in in the user's time zone, not UTC", () => {
    const rows = [
      { slug: "a", result: "solved" as const, createdAt: "2026-09-26T20:00:00Z" },
      { slug: "b", result: "failed" as const, createdAt: "2026-09-27T06:00:00Z" },
    ];
    expect(localAttempts(rows, "Asia/Kolkata").map((a) => a.date)).toEqual(["2026-09-27", "2026-09-27"]);
    expect(localAttempts(rows, "America/Los_Angeles").map((a) => a.date)).toEqual(["2026-09-26", "2026-09-26"]);
  });
});

const card = (topic: string) => ({ topic, score: 0, skipped: false, date: "2026-09-27" });

describe("answers, for Me's too-few-answers rule", () => {
  it("counts every check-in and card answer an area's accuracy rests on", () => {
    const dsa = dsaArea(important, [{ slug: "a", result: "failed", date: "2026-09-27" }], "2026-09-27", [card("a"), card("b")]);
    expect(dsa.answers).toBe(3);
    const topic = topicArea([{ slug: "x", importance: 1 }], new Set(), { attempts: [card("x")], today: "2026-09-27" });
    expect(topic.answers).toBe(1);
    expect(topicArea([{ slug: "x", importance: 1 }], new Set(["x"])).answers).toBe(0);
  });
});

describe("what the screens show (display only)", () => {
  it("is the Feed's threshold too: one constant for the app", () => {
    expect(MIN_AREA_ANSWERS).toBe(3);
  });

  it("hides an area's score below the threshold and shows it from there", () => {
    expect(shownAreaScore({ answers: MIN_AREA_ANSWERS - 1, score: 0 })).toBeNull();
    expect(shownAreaScore({ answers: MIN_AREA_ANSWERS, score: 0 })).toBe(0);
    expect(shownAreaScore({ answers: MIN_AREA_ANSWERS + 5, score: 62 })).toBe(62);
    expect(shownAreaScore({ answers: 10, score: null })).toBeNull();
  });

  it("leaves the overall ring empty until some area shows a score (Day 1: two wrong cards are not a red 0)", () => {
    const dayOne = [
      { answers: 2, score: 0 },
      { answers: 0, score: null },
    ];
    expect(shownOverall(0, dayOne)).toBeNull();
    expect(shownOverall(41, [...dayOne, { answers: MIN_AREA_ANSWERS, score: 55 }])).toBe(41);
    expect(shownOverall(null, [{ answers: 9, score: null }])).toBeNull();
  });
});
