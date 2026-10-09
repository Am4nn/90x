import { describe, expect, it } from "vitest";
import {
  clampSeek,
  COMPLETED_HOLD_MS,
  FOLLOW_RESUME_MS,
  followScrollTop,
  lineTone,
  listenWord,
  currentLine,
  FINISHED_AT,
  formatTime,
  isFinished,
  onError,
  remaining,
  resumeFrom,
  SAVE_EVERY_MS,
  sections,
  shouldSave,
  SPEEDS,
  type TimedLine,
} from "./rules";

const LINES: TimedLine[] = [
  { role: "narrator", text: "Open.", section: "intro", start_s: 0, end_s: 4 },
  { role: "narrator", text: "Step one.", section: "walkthrough", start_s: 4, end_s: 9 },
  { role: "state", text: "Window: p.", section: "walkthrough", start_s: 9, end_s: 11 },
  { role: "narrator", text: "Three things to remember.", section: "recap", start_s: 11, end_s: 14 },
];

describe("player rules", () => {
  it("offers the six speeds in order", () => {
    expect([...SPEEDS]).toEqual([0.8, 1, 1.25, 1.5, 1.75, 2]);
  });

  it("counts a lesson finished at 95%", () => {
    expect(FINISHED_AT).toBe(0.95);
    expect(isFinished(94, 100)).toBe(false);
    expect(isFinished(95, 100)).toBe(true);
    expect(isFinished(10, 0)).toBe(false);
  });

  it("saves on a tick only every 15 s, and always on pause, seek and hide", () => {
    expect(SAVE_EVERY_MS).toBe(15_000);
    expect(shouldSave(1_000, 10_000, "tick")).toBe(false);
    expect(shouldSave(1_000, 16_000, "tick")).toBe(true);
    for (const reason of ["pause", "seek", "hide"] as const) expect(shouldSave(1_000, 1_001, reason)).toBe(true);
  });

  it("resumes where the person left off, from the start once finished or near the end", () => {
    expect(resumeFrom(null, 300)).toBe(0);
    expect(resumeFrom({ positionS: 192, finishedAt: null }, 300)).toBe(192);
    expect(resumeFrom({ positionS: 192, finishedAt: "2026-10-09T10:00:00Z" }, 300)).toBe(0);
    expect(resumeFrom({ positionS: 297, finishedAt: null }, 300)).toBe(0);
  });

  it("formats times the way the mock shows them", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(192.6)).toBe("3:12");
    expect(formatTime(3600)).toBe("60:00");
    expect(remaining(192, 354)).toBe("-2:42");
  });

  it("clamps a seek to the file", () => {
    expect(clampSeek(-5, 100)).toBe(0);
    expect(clampSeek(120, 100)).toBe(100);
    expect(clampSeek(50, 100)).toBe(50);
  });

  it("onError: refreshes the URL once, then fails; never a loop", () => {
    expect(onError({ retried: false })).toEqual({ action: "refresh", retried: true });
    expect(onError({ retried: true })).toEqual({ action: "fail", retried: true });
  });

  it("finds the line under the playhead", () => {
    expect(currentLine(LINES, 0)).toBe(0);
    expect(currentLine(LINES, 9.5)).toBe(2);
    expect(currentLine(LINES, 14)).toBe(3);
    expect(currentLine([], 3)).toBe(-1);
  });

  it("lists the sections by their first line", () => {
    expect(sections(LINES)).toEqual([
      { section: "intro", start_s: 0 },
      { section: "walkthrough", start_s: 4 },
      { section: "recap", start_s: 11 },
    ]);
    expect(sections(LINES.map((l) => ({ ...l, section: null })))).toEqual([]);
  });
});

// Player fixes.
describe("listen bar word", () => {
  const base = { current: false, playing: false, positionS: 0, durationS: 300, finished: false, resumeAt: 0 };
  it("says Completed once the lesson was heard to the end, here or on an earlier visit", () => {
    expect(listenWord({ ...base, finished: true })).toBe("Completed");
    expect(listenWord({ ...base, current: true, positionS: 296 })).toBe("Completed");
  });
  it("says Playing while it plays, even past 95%, and Paused when stopped midway", () => {
    expect(listenWord({ ...base, current: true, playing: true, positionS: 296 })).toBe("Playing");
    expect(listenWord({ ...base, current: true, positionS: 120 })).toBe("Paused");
  });
  it("says Resume with saved progress and Listen for a fresh lesson", () => {
    expect(listenWord({ ...base, resumeAt: 42 })).toBe("Resume");
    expect(listenWord(base)).toBe("Listen");
  });
});

describe("lyrics transcript", () => {
  it("marks lines already read, the one being read, and those still to come", () => {
    expect([0, 1, 2, 3].map((i) => lineTone(i, 2))).toEqual(["past", "past", "now", "next"]);
    expect(lineTone(0, -1)).toBe("next");
  });
  it("scrolls the current line to the upper third of the box, never above the top", () => {
    expect(followScrollTop(900, 600)).toBe(720);
    expect(followScrollTop(100, 600)).toBe(0);
  });
  it("resumes following a few seconds after a manual scroll; the finished bar holds for five", () => {
    expect(FOLLOW_RESUME_MS).toBe(6000);
    expect(COMPLETED_HOLD_MS).toBe(5000);
  });
});
