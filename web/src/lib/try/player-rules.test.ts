import { describe, expect, it } from "vitest";
import { demoFrom, demoSrc, nextState, resumeAt } from "./player-rules";

describe("demo player rules", () => {
  it("starts idle; one press loads; a second press while loading does nothing", () => {
    const loading = nextState({ kind: "idle" }, { type: "press" });
    expect(loading).toEqual({ kind: "loading" });
    expect(nextState(loading, { type: "press" })).toBe(loading);
  });
  it("loads to ready; playing follows the element, not the press", () => {
    const ready = nextState({ kind: "loading" }, { type: "loaded", durationS: 417 });
    expect(ready).toEqual({ kind: "ready", durationS: 417, playing: true });
    // The toggle acts on the element; the element's own play and pause events say what it is doing.
    expect(nextState(ready, { type: "press" })).toBe(ready);
    const paused = nextState(ready, { type: "paused" });
    expect(paused).toEqual({ kind: "ready", durationS: 417, playing: false });
    expect(nextState(paused, { type: "playing" })).toEqual({
      kind: "ready",
      durationS: 417,
      playing: true,
    });
    expect(nextState(ready, { type: "ended" })).toEqual(paused);
  });
  it("element events outside the player do nothing", () => {
    for (const s of [{ kind: "idle" }, { kind: "loading" }, { kind: "failed" }, { kind: "missing" }] as const) {
      expect(nextState(s, { type: "playing" })).toBe(s);
      expect(nextState(s, { type: "paused" })).toBe(s);
    }
  });
  it("404 hides the player for good; 503 says it can't play and allows one more press", () => {
    expect(nextState({ kind: "loading" }, { type: "missing" })).toEqual({
      kind: "missing",
    });
    const failed = nextState({ kind: "loading" }, { type: "failed" });
    expect(failed).toEqual({ kind: "failed" });
    expect(nextState(failed, { type: "press" })).toEqual({ kind: "loading" });
  });
  it("prefers the e2e tone over the signed URL", () => {
    expect(demoSrc("https://r2/x.mp3", "/e2e/tone.mp3")).toBe("/e2e/tone.mp3");
    expect(demoSrc("https://r2/x.mp3", undefined)).toBe("https://r2/x.mp3");
  });
  it("takes the route's answer only in the shape it promises", () => {
    const lines = [{ role: "narrator", text: "One", section: "intro", start_s: 0, end_s: 2 }];
    expect(demoFrom({ slug: "x", url: "https://r2/x.mp3", durationS: 417, lines })).toEqual({
      url: "https://r2/x.mp3",
      durationS: 417,
      lines,
    });
    expect(demoFrom({ url: "https://r2/x.mp3", lines })).toEqual({
      url: "https://r2/x.mp3",
      durationS: 0,
      lines,
    });
    expect(demoFrom({ url: 7, lines })).toBeNull();
    expect(demoFrom({ url: "https://r2/x.mp3", lines: "no" })).toBeNull();
    expect(demoFrom(null)).toBeNull();
    expect(demoFrom("nope")).toBeNull();
  });
  it("a first play cut short by a pause still opens the player, paused, so the next press plays", () => {
    const ready = nextState({ kind: "loading" }, { type: "loaded", durationS: 417, playing: false });
    expect(ready).toEqual({ kind: "ready", durationS: 417, playing: false });
  });
  it("resumes where it stopped, but a finished lesson starts over", () => {
    expect(resumeAt(120, 417)).toBe(120);
    expect(resumeAt(0, 417)).toBe(0);
    expect(resumeAt(416.5, 417)).toBe(0);
    expect(resumeAt(417, 417)).toBe(0);
    expect(resumeAt(500, 417)).toBe(0); // the e2e tone runs past the lesson
    expect(resumeAt(30, 0)).toBe(30); // unknown length: keep it
  });
});
