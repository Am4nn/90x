// The little chat under Ren. It is an illustration: a question types out, a pause,
// then Ren's answer types out, and the loop starts again. The clock counts typed
// characters (one every 28 ms) so the timeline is plain arithmetic.

export const CHAT_QUESTION = "Why do I keep failing sliding window?";
export const CHAT_ANSWER = "In 4 of your last 6 attempts you shrank the window before checking the condition.";

/** One typed character takes this long. */
export const CHAT_CHAR_MS = 28;
/** Characters of waiting between the question and the answer. */
const PAUSE = 20;
/** Characters of holding the finished answer, and of blank before the loop restarts. */
const HOLD = 140;
const GAP = 60;

/** The clock value at which both lines are complete. */
export const CHAT_DONE = CHAT_QUESTION.length + PAUSE + CHAT_ANSWER.length + HOLD;
/** The clock wraps here. */
export const CHAT_LOOP = CHAT_DONE + GAP;

export interface ChatFrame {
  question: string;
  answer: string;
  /** Whether Ren has started answering (its line is shown). */
  answering: boolean;
  /** Whether the caret is still moving (the answer is not complete). */
  typing: boolean;
}

/** What is on screen when the clock reads `clock` characters. */
export function chatFrame(clock: number): ChatFrame {
  const asked = Math.min(CHAT_QUESTION.length, Math.floor(clock));
  const answered = Math.max(0, Math.min(CHAT_ANSWER.length, Math.floor(clock - CHAT_QUESTION.length - PAUSE)));
  return {
    question: CHAT_QUESTION.slice(0, asked),
    answer: CHAT_ANSWER.slice(0, answered),
    answering: clock > CHAT_QUESTION.length + PAUSE,
    typing: answered < CHAT_ANSWER.length,
  };
}

/** The chat as it reads when nothing moves: both lines complete. */
export const STILL_CHAT: ChatFrame = chatFrame(CHAT_DONE);
