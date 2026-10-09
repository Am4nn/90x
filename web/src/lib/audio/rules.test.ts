import { describe, expect, it } from "vitest";
import {
  clampSeek,
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
