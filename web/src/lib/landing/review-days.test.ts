import { describe, expect, it } from "vitest";
import { scoreToRating } from "@/lib/feed/grade";
import { nextState, stretchCorrect } from "@/lib/feed/srs";
import { FIRST_CORRECT_DAYS, FIRST_MISS_DAYS } from "./review-days";

const NOW = new Date("2026-10-07T12:00:00Z");
const days = (due: Date) => (due.getTime() - NOW.getTime()) / 86_400_000;

describe("what the page says about when a first answer comes back", () => {
  it("a perfect pick-one is rated Easy, and the Feed books it 30 days out", () => {
    const rating = scoreToRating(1, false);
    expect(rating).toBe(4);
    // saveAnswer (lib/feed/service.ts) runs nextState and then stretchCorrect on a correct answer: this is what the Feed books.
    const booked = stretchCorrect(nextState(null, rating, NOW), {
      rating,
      now: NOW,
      retire: false,
    });
    expect(days(booked.dueAt)).toBe(FIRST_CORRECT_DAYS);
    expect(FIRST_CORRECT_DAYS).toBe(30);
  });

  it("a miss is rated Again and comes back the next day", () => {
    expect(scoreToRating(0, false)).toBe(1);
    expect(days(nextState(null, scoreToRating(0, false), NOW).dueAt)).toBe(FIRST_MISS_DAYS);
    expect(FIRST_MISS_DAYS).toBe(1);
  });
});
