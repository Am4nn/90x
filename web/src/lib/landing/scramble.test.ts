import { describe, expect, it } from "vitest";
import { chatFrame, CHAT_ANSWER, CHAT_DONE, CHAT_LOOP, CHAT_QUESTION, STILL_CHAT } from "./chat";
import { headlineFrame, PHRASE_MS, PHRASES, scramble, STILL_HEADLINE } from "./scramble";

describe("scramble", () => {
  it("shows only what has not landed, keeping the spaces", () => {
    const text = "plans your next day.";
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

describe("headlineFrame", () => {
  it("lands one letter every 22ms from empty", () => {
    expect(headlineFrame(0)).toMatchObject({ phrase: 0, landed: "", noise: expect.any(String) });
    expect(headlineFrame(0).noise).toHaveLength(PHRASES[0].length);
    expect(headlineFrame(22 * 5).landed).toBe("grade");
    expect(headlineFrame(22 * 5).landed + headlineFrame(22 * 5).noise).toHaveLength(PHRASES[0].length);
  });

  it("is complete after the last letter lands, and stays so until the phrase changes", () => {
    expect(headlineFrame(22 * PHRASES[0].length)).toMatchObject({ landed: PHRASES[0], noise: "" });
    expect(headlineFrame(PHRASE_MS - 1)).toMatchObject({ phrase: 0, landed: PHRASES[0], noise: "" });
  });

  it("moves to the next phrase every 3.4s and wraps after the third", () => {
    expect(headlineFrame(PHRASE_MS).phrase).toBe(1);
    expect(headlineFrame(PHRASE_MS * 2 + 22 * 4).landed).toBe(PHRASES[2].slice(0, 4));
    expect(headlineFrame(PHRASE_MS * 3).phrase).toBe(0);
  });

  it("reads as the first phrase, whole, when nothing moves", () => {
    expect(STILL_HEADLINE).toEqual({ phrase: 0, landed: "grades what you type.", noise: "" });
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
