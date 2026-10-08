import { describe, expect, it } from "vitest";
import { chatFrame, CHAT_ANSWER, CHAT_DONE, CHAT_LOOP, CHAT_QUESTION, STILL_CHAT } from "./chat";
import { changedLetters, type HeadlineFrame, headlineFrame, PHRASE_MS, PHRASES, scramble, STILL_HEADLINE } from "./scramble";

describe("scramble", () => {
  it("shows only what has not landed, keeping the spaces", () => {
    const text = "that plans your day.";
    expect(scramble(text, text.length, 0)).toBe("");
    const rest = scramble(text, 6, 0);
    expect(rest).toHaveLength(text.length - 6);
    expect(rest.split("").map((c) => c === " ")).toEqual(
      text
        .slice(6)
        .split("")
        .map((c) => c === " "),
    );
    expect(rest).not.toContain("a");
  });

  it("uses only the designer's symbols, and changes with the seed", () => {
    const a = scramble("remembers what you miss.", 0, 0);
    const b = scramble("remembers what you miss.", 0, 1);
    expect(a).not.toBe(b);
    expect(a.replaceAll(" ", "")).toMatch(/^[#%@*+=\-:/<>.]*$/);
  });
});

const text = (f: HeadlineFrame) => f.parts.map((p) => p.text).join("");
const landed = (f: HeadlineFrame) => f.parts.filter((p) => !p.noise).map((p) => p.text);

describe("changedLetters", () => {
  it("marks only the letters of words that are not at the same place before, never a space", () => {
    expect(changedLetters("that checks", "that plans")).toEqual([...Array(5).fill(false), ...Array(6).fill(true)]);
    expect(changedLetters("a b c", "x b y")).toEqual([true, false, false, false, true]);
    expect(changedLetters("same words", "same words").some(Boolean)).toBe(false);
  });
});

describe("headlineFrame", () => {
  it("shows the first phrase whole on the first pass, so the page opens on a still line", () => {
    expect(headlineFrame(0)).toEqual(STILL_HEADLINE);
    expect(headlineFrame(PHRASE_MS - 1)).toEqual(STILL_HEADLINE);
  });

  it("holds each phrase for 6s and wraps after the third", () => {
    expect(PHRASE_MS).toBe(6000);
    expect(headlineFrame(PHRASE_MS).phrase).toBe(1);
    expect(headlineFrame(PHRASE_MS * 2).phrase).toBe(2);
    expect(headlineFrame(PHRASE_MS * 3).phrase).toBe(0);
  });

  it("keeps the shared word and scrambles only the words that change", () => {
    const start = headlineFrame(PHRASE_MS);
    expect(text(start)).toHaveLength(PHRASES[1].length);
    expect(start.parts[0]).toEqual({ text: "that ", noise: false });
    expect(start.parts.slice(1).every((p) => p.noise || p.text.trim() === "")).toBe(true);
    // Five letters in, the first five changed letters have landed; "that " was never noise.
    expect(landed(headlineFrame(PHRASE_MS + 22 * 5))[0]).toBe("that check");
  });

  it("is complete once the changed letters have landed, and stays so until the next phrase", () => {
    const changed = changedLetters(PHRASES[1], PHRASES[0]).filter(Boolean).length;
    expect(headlineFrame(PHRASE_MS + 22 * changed).parts).toEqual([{ text: PHRASES[1], noise: false }]);
    expect(headlineFrame(PHRASE_MS * 2 - 1).parts).toEqual([{ text: PHRASES[1], noise: false }]);
  });

  it("wraps from the third phrase back to the first through noise, not a jump", () => {
    const back = headlineFrame(PHRASE_MS * 3 + 22);
    expect(back.phrase).toBe(0);
    expect(back.parts.some((p) => p.noise)).toBe(true);
    expect(text(back)).toHaveLength(PHRASES[0].length);
  });

  it("reads as the first phrase, whole, when nothing moves", () => {
    expect(STILL_HEADLINE).toEqual({ phrase: 0, parts: [{ text: "that plans your day.", noise: false }] });
  });
});

describe("chatFrame", () => {
  it("types the question one character at a time before Ren says anything", () => {
    expect(chatFrame(0)).toMatchObject({ question: "", answer: "", answering: false });
    expect(chatFrame(3.9).question).toBe(CHAT_QUESTION.slice(0, 3));
    expect(chatFrame(CHAT_QUESTION.length + 5)).toMatchObject({ question: CHAT_QUESTION, answering: false });
  });

  it("starts Ren's line after a 20-character pause and types it with a caret", () => {
    const start = CHAT_QUESTION.length + 20;
    expect(chatFrame(start).answering).toBe(false);
    expect(chatFrame(start + 0.5)).toMatchObject({ answering: true, answer: "", typing: true });
    expect(chatFrame(start + 10).answer).toBe(CHAT_ANSWER.slice(0, 10));
  });

  it("drops the caret once the answer is complete, and holds it before looping", () => {
    expect(chatFrame(CHAT_QUESTION.length + 20 + CHAT_ANSWER.length)).toMatchObject({ answer: CHAT_ANSWER, typing: false });
    expect(STILL_CHAT).toMatchObject({ question: CHAT_QUESTION, answer: CHAT_ANSWER, answering: true, typing: false });
    expect(CHAT_LOOP).toBeGreaterThan(CHAT_DONE);
  });
});
